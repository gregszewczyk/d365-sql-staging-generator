/**
 * Tree <-> grc_filtercriterion rows.
 *
 * Group encoding: grc_groupid holds a dot-separated *path* of segments, one per
 * nesting level, each segment `<index><logic>` where logic is "a" (AND) or
 * "o" (OR):
 *
 *   "0a"        -> the root group, AND
 *   "0a.1o"     -> second nested group inside the root, OR
 *   "0a.1o.0a"  -> arbitrary depth is representable
 *
 * grc_grouplogic stores the containing group's logic redundantly so rows stay
 * individually reportable.
 *
 * Object type conditions are stored as ORDINARY rows (grc_attribute = the type
 * column), because type is no longer special. grc_sourceobjecttype is kept as a
 * denormalised convenience: every row of a scope set is stamped with the
 * distinct types the tree references, so existing "which scope sets touch
 * Servers?" reporting keeps working without parsing the tree.
 *
 * Two earlier storage shapes load losslessly, because type-as-a-condition can
 * express both:
 *  - per-block rows (root segment used as a block index, one type per block)
 *    become an OR of AND groups, each with its type condition injected;
 *  - shared-type-list rows (one delimited grc_sourceobjecttype, no type rows)
 *    get a single type condition injected at the root.
 * Either way the loaded tree is marked dirty so the new shape is only persisted
 * deliberately.
 */

import { BuilderConfig } from "./config";
import {
  ConditionNode,
  GroupLogic,
  GroupNode,
  Operator,
  OPERATOR_LABELS,
  ScopeSetFilter,
  TYPE_DELIMITER
} from "./types";
import { emptyCondition, newId } from "./treeUtils";

export interface CriterionRow {
  /** Dataverse row id; undefined for rows not yet created. */
  id?: string;
  name: string;
  sourceObjectType: string;
  attribute: string;
  operator: Operator;
  value: string;
  groupId: string;
  groupLogic: GroupLogic;
  sequence: number;
}

const SEGMENT_RE = /^(\d+)([ao])$/;

function segment(index: number, logic: GroupLogic): string {
  return `${index}${logic === "or" ? "o" : "a"}`;
}

function deriveName(row: { attribute: string; operator: Operator; value: string }): string {
  const label = `${row.attribute} ${OPERATOR_LABELS[row.operator]} ${row.value}`;
  return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}

/** Serialise the derived type list for the denormalised grc_sourceobjecttype. */
export function serialiseTypes(objectTypes: string[]): string {
  return objectTypes.join(TYPE_DELIMITER);
}

export function parseTypes(stored: string): string[] {
  return stored
    .split(TYPE_DELIMITER)
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

/**
 * The distinct object types the tree references, for the denormalised column.
 *
 * Only positive conditions (eq / in) contribute: `Type != Office` does not tell
 * us which types the set covers, so counting it would make the column
 * misleading for "which scope sets touch X?" reporting.
 */
export function deriveTypes(filter: ScopeSetFilter, typeAttribute: string): string[] {
  const found: string[] = [];
  const walk = (g: GroupNode) => {
    for (const c of g.conditions) {
      if (c.attribute !== typeAttribute) continue;
      if (c.operator !== "eq" && c.operator !== "in") continue;
      parseTypes(c.value).forEach((t) => {
        if (found.indexOf(t) < 0) found.push(t);
      });
    }
    g.groups.forEach(walk);
  };
  walk(filter.root);
  return found;
}

/** Flatten the filter into rows. Incomplete conditions (no attribute) are skipped. */
export function flattenTree(filter: ScopeSetFilter, typeAttribute: string): CriterionRow[] {
  const rows: CriterionRow[] = [];
  const types = serialiseTypes(deriveTypes(filter, typeAttribute));
  let seq = 0;
  const walk = (group: GroupNode, path: string) => {
    for (const c of group.conditions) {
      if (c.attribute.trim() === "") continue;
      seq += 10;
      rows.push({
        id: c.criterionId,
        name: deriveName(c),
        sourceObjectType: types,
        attribute: c.attribute,
        operator: c.operator,
        value: c.value,
        groupId: path,
        groupLogic: group.logic,
        sequence: seq
      });
    }
    group.groups.forEach((g, i) => walk(g, `${path}.${segment(i, g.logic)}`));
  };
  walk(filter.root, segment(0, filter.root.logic));
  return rows;
}

interface ParsedRow {
  row: CriterionRow;
  segments: string[];
}

/** Build one subtree from rows sharing a root segment. */
function buildSubtree(parsed: ParsedRow[], rootSegment: string): GroupNode {
  const m = SEGMENT_RE.exec(rootSegment);
  const root: GroupNode = {
    id: newId("g"),
    logic: m && m[2] === "o" ? "or" : "and",
    conditions: [],
    groups: []
  };

  for (const { row, segments } of parsed) {
    let group = root;
    for (const seg of segments.slice(1)) {
      const sm = SEGMENT_RE.exec(seg);
      if (!sm) break; // unknown format -> attach at the deepest group reached
      const index = Number(sm[1]);
      const logic: GroupLogic = sm[2] === "o" ? "or" : "and";
      while (group.groups.length <= index) {
        group.groups.push({ id: newId("g"), logic: "and", conditions: [], groups: [] });
      }
      group.groups[index].logic = logic;
      group = group.groups[index];
    }
    group.conditions.push({
      id: newId("c"),
      criterionId: row.id,
      attribute: row.attribute,
      operator: row.operator,
      value: row.value
    });
  }
  return root;
}

export interface BuildResult {
  filter: ScopeSetFilter;
  /** True when rows in an earlier storage shape were upgraded on load. */
  converted: boolean;
}

function typeCondition(typeAttribute: string, types: string[]): ConditionNode {
  return {
    id: newId("c"),
    // No criterionId: this is new data, created on the next save.
    attribute: typeAttribute,
    operator: types.length > 1 ? "in" : "eq",
    value: serialiseTypes(types)
  };
}

/**
 * Rebuild the filter from loaded rows.
 *
 * Rows that already carry type conditions are the current shape and load
 * verbatim. Rows without any are from an earlier design, where the type lived in
 * grc_sourceobjecttype instead; those get an equivalent type condition injected
 * so nothing is lost.
 */
export function buildTree(rows: CriterionRow[], typeAttribute: string): BuildResult {
  const sorted = [...rows].sort((a, b) => a.sequence - b.sequence);
  const hasTypeRows = sorted.some((r) => r.attribute === typeAttribute);

  const parsed: ParsedRow[] = sorted.map((row) => ({
    row,
    segments: row.groupId ? row.groupId.split(".") : []
  }));

  // Bucket by root segment, preserving first-seen order. The earlier per-block
  // design used the root segment as a block index, so several buckets means
  // several former blocks.
  const buckets = new Map<string, ParsedRow[]>();
  for (const p of parsed) {
    const rootSeg = p.segments[0] && SEGMENT_RE.test(p.segments[0]) ? p.segments[0] : "0a";
    const bucket = buckets.get(rootSeg);
    if (bucket) bucket.push(p);
    else buckets.set(rootSeg, [p]);
  }

  let root: GroupNode;
  let converted = false;

  if (buckets.size === 0) {
    root = { id: newId("g"), logic: "and", conditions: [], groups: [] };
  } else if (buckets.size === 1) {
    const [seg, bucketRows] = Array.from(buckets.entries())[0];
    root = buildSubtree(bucketRows, seg);
    if (!hasTypeRows) {
      // Shared-type-list shape: one type condition covers the whole tree.
      const types = parseTypes(bucketRows[0].row.sourceObjectType);
      if (types.length > 0) {
        converted = true;
        if (root.logic === "and") {
          root.conditions.unshift(typeCondition(typeAttribute, types));
        } else {
          // An OR root must be nested so the type still constrains everything.
          root = {
            id: newId("g"),
            logic: "and",
            conditions: [typeCondition(typeAttribute, types)],
            groups: [root]
          };
        }
      }
    }
  } else {
    // Per-block shape: OR the former blocks, each keeping its own type.
    converted = true;
    root = { id: newId("g"), logic: "or", conditions: [], groups: [] };
    for (const [seg, bucketRows] of buckets.entries()) {
      const sub = buildSubtree(bucketRows, seg);
      if (!hasTypeRows) {
        const types = parseTypes(bucketRows[0].row.sourceObjectType);
        if (types.length > 0) {
          if (sub.logic === "and") {
            sub.conditions.unshift(typeCondition(typeAttribute, types));
          } else {
            root.groups.push({
              id: newId("g"),
              logic: "and",
              conditions: [typeCondition(typeAttribute, types)],
              groups: [sub]
            });
            continue;
          }
        }
      }
      root.groups.push(sub);
    }
  }

  // A group created only as a parent placeholder should still be editable.
  const ensureEditable = (g: GroupNode) => {
    if (g.conditions.length === 0 && g.groups.length === 0) g.conditions.push(emptyCondition());
    g.groups.forEach(ensureEditable);
  };
  ensureEditable(root);

  return { filter: { root }, converted };
}

// ---------------------------------------------------------------------------
// Dataverse I/O
// ---------------------------------------------------------------------------

type WebApi = ComponentFramework.WebApi;

/**
 * NOTE on choiceMaps.sourceObjectType: the denormalised type list can hold
 * several delimited values, which a Choice column cannot store, so
 * grc_sourceobjecttype must be Text once a tree references more than one type.
 * A configured map still applies when the list is a single value.
 */
function toStored(map: Record<string, number> | undefined, value: string): string | number {
  if (map && value in map) return map[value];
  return value;
}

function fromStored(map: Record<string, number> | undefined, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (map) {
    const hit = Object.entries(map).find(([, num]) => num === value);
    if (hit) return hit[0];
  }
  return String(value);
}

export async function loadCriteria(
  webAPI: WebApi,
  config: BuilderConfig,
  scopeSetId: string
): Promise<CriterionRow[]> {
  const c = config.criterionColumns;
  const idAttr = `${config.criterionEntity}id`;
  const select = [idAttr, c.sourceObjectType, c.attribute, c.operator, c.value, c.groupId, c.groupLogic, c.sequence]
    .join(",");
  const options =
    `?$select=${select}&$filter=_${c.scopeSetLookup}_value eq ${scopeSetId}&$orderby=${c.sequence} asc`;
  const result = await webAPI.retrieveMultipleRecords(config.criterionEntity, options);
  return result.entities.map((e, i) => ({
    id: e[idAttr] as string,
    name: "",
    sourceObjectType: fromStored(config.choiceMaps.sourceObjectType, e[c.sourceObjectType]),
    attribute: (e[c.attribute] as string) ?? "",
    operator: (fromStored(config.choiceMaps.operator, e[c.operator]) || "eq") as Operator,
    value: (e[c.value] as string) ?? "",
    groupId: (e[c.groupId] as string) ?? "",
    groupLogic: fromStored(config.choiceMaps.groupLogic, e[c.groupLogic]) === "or" ? "or" : "and",
    sequence: (e[c.sequence] as number) ?? (i + 1) * 10
  }));
}

/**
 * Persist the current filter: update rows that still exist, create new ones,
 * delete rows removed in the UI. Returns the number of writes performed.
 */
export async function saveCriteria(
  webAPI: WebApi,
  config: BuilderConfig,
  scopeSetId: string,
  rows: CriterionRow[],
  existingIds: string[]
): Promise<number> {
  const c = config.criterionColumns;
  const kept = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
  let writes = 0;

  for (const row of rows) {
    const data: Record<string, unknown> = {
      [c.name]: row.name,
      [c.sourceObjectType]: toStored(config.choiceMaps.sourceObjectType, row.sourceObjectType),
      [c.attribute]: row.attribute,
      [c.operator]: toStored(config.choiceMaps.operator, row.operator),
      [c.value]: row.value,
      [c.groupId]: row.groupId,
      [c.groupLogic]: toStored(config.choiceMaps.groupLogic, row.groupLogic),
      [c.sequence]: row.sequence
    };
    if (row.id) {
      await webAPI.updateRecord(config.criterionEntity, row.id, data);
    } else {
      data[`${c.scopeSetNav}@odata.bind`] = `/${c.scopeSetEntitySet}(${scopeSetId})`;
      await webAPI.createRecord(config.criterionEntity, data);
    }
    writes += 1;
  }

  for (const id of existingIds) {
    if (!kept.has(id)) {
      await webAPI.deleteRecord(config.criterionEntity, id);
      writes += 1;
    }
  }
  return writes;
}
