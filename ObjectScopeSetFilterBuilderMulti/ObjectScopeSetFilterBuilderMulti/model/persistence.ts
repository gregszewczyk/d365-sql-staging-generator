/**
 * Tree <-> grc_filtercriterion rows.
 *
 * Group encoding (answers brief open question 3 while keeping criteria as rows):
 * grc_groupid holds a dot-separated *path* of segments, one per nesting level,
 * each segment `<index><logic>` where logic is "a" (AND) or "o" (OR):
 *
 *   "0a"        -> root group of type block 0, AND
 *   "0a.1o"     -> second nested group inside that root, OR
 *   "1o.0a.2o"  -> arbitrary depth is representable
 *
 * grc_grouplogic still stores the containing group's logic redundantly so the
 * rows stay individually reportable, as the brief requires. Rebuilding the
 * tree needs only grc_sourceobjecttype + grc_groupid + grc_sequence.
 */

import { BuilderConfig } from "./config";
import { GroupLogic, GroupNode, Operator, OPERATOR_LABELS, TypeBlockNode } from "./types";
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

/** Flatten the tree into rows. Incomplete conditions (no attribute) are skipped. */
export function flattenTree(blocks: TypeBlockNode[]): CriterionRow[] {
  const rows: CriterionRow[] = [];
  let seq = 0;
  const walk = (group: GroupNode, path: string, objectType: string) => {
    for (const c of group.conditions) {
      if (c.attribute.trim() === "") continue;
      seq += 10;
      rows.push({
        id: c.criterionId,
        name: deriveName(c),
        sourceObjectType: objectType,
        attribute: c.attribute,
        operator: c.operator,
        value: c.value,
        groupId: path,
        groupLogic: group.logic,
        sequence: seq
      });
    }
    group.groups.forEach((g, i) => walk(g, `${path}.${segment(i, g.logic)}`, objectType));
  };
  blocks
    .filter((b) => b.objectType.trim() !== "")
    .forEach((b, bi) => walk(b.root, segment(bi, b.root.logic), b.objectType));
  return rows;
}

/** Rebuild the tree from loaded rows. Tolerates unknown groupId formats by
 *  dropping such rows into the block's root group. */
export function buildTree(rows: CriterionRow[]): TypeBlockNode[] {
  const sorted = [...rows].sort((a, b) => a.sequence - b.sequence);
  const blocks = new Map<string, TypeBlockNode>();
  const blockOrder: string[] = [];

  for (const row of sorted) {
    const segments = row.groupId ? row.groupId.split(".") : [];
    const rootSeg = segments[0] && SEGMENT_RE.test(segments[0]) ? segments[0] : "?";
    // One block per (object type, root segment): the same type may appear in
    // several blocks, distinguished by the block index in the path.
    const blockKey = `${rootSeg}|${row.sourceObjectType}`;
    let block = blocks.get(blockKey);
    if (!block) {
      const rootMatch = rootSeg === "?" ? null : SEGMENT_RE.exec(rootSeg);
      block = {
        id: newId("b"),
        objectType: row.sourceObjectType,
        root: { id: newId("g"), logic: rootMatch && rootMatch[2] === "o" ? "or" : "and", conditions: [], groups: [] }
      };
      blocks.set(blockKey, block);
      blockOrder.push(blockKey);
    }

    let group = block.root;
    if (rootSeg !== "?") {
      // Walk/create the nested chain below the root segment.
      for (const seg of segments.slice(1)) {
        const m = SEGMENT_RE.exec(seg);
        if (!m) break; // unknown format -> attach to the deepest group reached
        const index = Number(m[1]);
        const logic: GroupLogic = m[2] === "o" ? "or" : "and";
        while (group.groups.length <= index) {
          group.groups.push({ id: newId("g"), logic: "and", conditions: [], groups: [] });
        }
        group.groups[index].logic = logic;
        group = group.groups[index];
      }
    } else if (row.groupLogic) {
      block.root.logic = row.groupLogic;
    }

    group.conditions.push({
      id: newId("c"),
      criterionId: row.id,
      attribute: row.attribute,
      operator: row.operator,
      value: row.value
    });
  }

  const result = blockOrder.map((k) => blocks.get(k)!);
  // A group created only as a parent placeholder should still be editable.
  const ensureEditable = (g: GroupNode) => {
    if (g.conditions.length === 0 && g.groups.length === 0) g.conditions.push(emptyCondition());
    g.groups.forEach(ensureEditable);
  };
  result.forEach((b) => ensureEditable(b.root));
  return result;
}

// ---------------------------------------------------------------------------
// Dataverse I/O
// ---------------------------------------------------------------------------

type WebApi = ComponentFramework.WebApi;

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
 * Persist the current tree: update rows that still exist, create new ones,
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
