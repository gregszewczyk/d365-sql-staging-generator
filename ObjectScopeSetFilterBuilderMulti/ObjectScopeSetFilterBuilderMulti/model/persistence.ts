/**
 * Tree <-> grc_filtercriterion rows (MULTI-TYPE VARIANT).
 *
 * Group encoding: grc_groupid holds a dot-separated *path* of segments, one per
 * nesting level, each segment `<index><logic>` where logic is "a" (AND) or
 * "o" (OR):
 *
 *   "0a"        -> the shared root group, AND
 *   "0a.1o"     -> second nested group inside the root, OR
 *   "0a.1o.0a"  -> arbitrary depth is representable
 *
 * grc_grouplogic stores the containing group's logic redundantly so rows stay
 * individually reportable. grc_sourceobjecttype holds the scope set's object
 * type list, delimited ONLY when there are 2+ types — a single-type filter
 * therefore writes rows byte-identical to the original control's, so anything
 * that can round-trip between the two components does.
 *
 * Rows written by the ORIGINAL control use the root segment as a per-block
 * index ("0a", "1a", ...), each block pinning its own single type. This variant
 * has one shared tree, so such data is converted on load: the types are unioned
 * and each former block becomes a nested group under an OR root. That is the
 * closest faithful shape, but it is broader than the original — hence the
 * `converted` flag, which the UI surfaces as a warning.
 */

import { BuilderConfig } from "./config";
import { GroupLogic, GroupNode, Operator, OPERATOR_LABELS, ScopeSetFilter, TYPE_DELIMITER } from "./types";
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

/** Serialise the type list for grc_sourceobjecttype (delimited only when 2+). */
export function serialiseTypes(objectTypes: string[]): string {
  return objectTypes.join(TYPE_DELIMITER);
}

export function parseTypes(stored: string): string[] {
  return stored
    .split(TYPE_DELIMITER)
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

/** Flatten the filter into rows. Incomplete conditions (no attribute) are skipped. */
export function flattenTree(filter: ScopeSetFilter): CriterionRow[] {
  const rows: CriterionRow[] = [];
  const types = serialiseTypes(filter.objectTypes);
  if (filter.objectTypes.length === 0) return rows;
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
  /** True when per-block (original-control) data was merged into one tree. */
  converted: boolean;
}

/** Rebuild the filter from loaded rows. */
export function buildTree(rows: CriterionRow[]): BuildResult {
  const sorted = [...rows].sort((a, b) => a.sequence - b.sequence);

  // The type list is the union across rows: one shared list in this variant,
  // but original-control rows carry a different single type per block.
  const objectTypes: string[] = [];
  sorted.forEach((r) =>
    parseTypes(r.sourceObjectType).forEach((t) => {
      if (!objectTypes.includes(t)) objectTypes.push(t);
    })
  );

  const parsed: ParsedRow[] = sorted.map((row) => ({
    row,
    segments: row.groupId ? row.groupId.split(".") : []
  }));

  // Bucket by root segment, preserving first-seen order.
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
  } else {
    // Legacy per-block data: OR the former blocks together as nested groups.
    converted = true;
    root = { id: newId("g"), logic: "or", conditions: [], groups: [] };
    for (const [seg, bucketRows] of buckets.entries()) {
      root.groups.push(buildSubtree(bucketRows, seg));
    }
  }

  // A group created only as a parent placeholder should still be editable.
  const ensureEditable = (g: GroupNode) => {
    if (g.conditions.length === 0 && g.groups.length === 0) g.conditions.push(emptyCondition());
    g.groups.forEach(ensureEditable);
  };
  ensureEditable(root);

  return { filter: { objectTypes, root }, converted };
}

// ---------------------------------------------------------------------------
// Dataverse I/O
// ---------------------------------------------------------------------------

type WebApi = ComponentFramework.WebApi;

/**
 * NOTE on choiceMaps.sourceObjectType: a delimited multi-type list cannot be
 * stored in a Choice column, so selecting 2+ object types requires
 * grc_sourceobjecttype to be Text. A configured map still applies to
 * single-type filters, where the stored value is one plain type.
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
