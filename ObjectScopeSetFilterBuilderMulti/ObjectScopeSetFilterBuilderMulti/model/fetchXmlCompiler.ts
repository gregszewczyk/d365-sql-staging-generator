/**
 * Criteria tree -> FetchXML. Pure functions, no Dataverse dependency —
 * this is the unit-tested core of the control.
 *
 * Shape produced (matches the brief's patterns):
 *  - each type block compiles to <filter type="and"> pinning the object type,
 *    with the block's root group flattened into it when the root is AND, or
 *    nested as <filter type="or"> when the root is ANY;
 *  - nested groups become nested <filter> elements at arbitrary depth;
 *  - multiple type blocks are wrapped in one <filter type="or">.
 */

import { ConditionNode, GroupNode, IN_DELIMITER, TypeBlockNode } from "./types";

export interface CompileOptions {
  /** Logical name of the CMDB objects table, e.g. grc_jiraobject. */
  entityName: string;
  /** Column holding the object type, e.g. grc_objecttype. */
  typeAttribute: string;
  /** Columns to select in the preview query. */
  selectAttributes: string[];
  /** Row cap for the preview (fetch top). Omit for no cap. */
  top?: number;
  /** When set, adds `<activeAttribute> eq 1` to every block (Yes/No column). */
  activeAttribute?: string | null;
  /** Order preview rows by this attribute (default: first select attribute). */
  orderBy?: string;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A condition contributes to the query only when fully specified. */
export function isConditionComplete(c: ConditionNode): boolean {
  return c.attribute.trim() !== "" && c.value.trim() !== "";
}

function conditionToXml(c: ConditionNode): string {
  const attr = escapeXml(c.attribute.trim());
  switch (c.operator) {
    case "like": {
      return `<condition attribute="${attr}" operator="like" value="${escapeXml(`%${c.value.trim()}%`)}" />`;
    }
    case "in": {
      const values = c.value
        .split(IN_DELIMITER)
        .map((v) => v.trim())
        .filter((v) => v !== "");
      if (values.length === 0) return "";
      const children = values.map((v) => `<value>${escapeXml(v)}</value>`).join("");
      return `<condition attribute="${attr}" operator="in">${children}</condition>`;
    }
    default:
      return `<condition attribute="${attr}" operator="${c.operator}" value="${escapeXml(c.value.trim())}" />`;
  }
}

/** Inner XML of a group (conditions then subgroups), or "" when nothing usable. */
function groupChildrenXml(g: GroupNode): string {
  const parts: string[] = [];
  for (const c of g.conditions) {
    if (isConditionComplete(c)) {
      const xml = conditionToXml(c);
      if (xml) parts.push(xml);
    }
  }
  for (const sub of g.groups) {
    const xml = groupToXml(sub);
    if (xml) parts.push(xml);
  }
  return parts.join("");
}

function groupToXml(g: GroupNode): string {
  const children = groupChildrenXml(g);
  if (!children) return "";
  return `<filter type="${g.logic}">${children}</filter>`;
}

/** True when the block has at least one complete condition somewhere in its tree. */
export function blockHasCriteria(b: TypeBlockNode): boolean {
  return groupChildrenXml(b.root) !== "";
}

function blockToXml(b: TypeBlockNode, opts: CompileOptions): string {
  const pins: string[] = [
    `<condition attribute="${escapeXml(opts.typeAttribute)}" operator="eq" value="${escapeXml(b.objectType)}" />`
  ];
  if (opts.activeAttribute) {
    pins.push(`<condition attribute="${escapeXml(opts.activeAttribute)}" operator="eq" value="1" />`);
  }
  // Root AND flattens into the pinning filter (matches the brief's first
  // example); root OR nests as its own filter inside it.
  const inner = b.root.logic === "and" ? groupChildrenXml(b.root) : groupToXml(b.root);
  return `<filter type="and">${pins.join("")}${inner}</filter>`;
}

/** Blocks with a chosen object type take part in the query (even with no conditions yet). */
function usableBlocks(blocks: TypeBlockNode[]): TypeBlockNode[] {
  return blocks.filter((b) => b.objectType.trim() !== "");
}

/** The combined <filter> for all type blocks, or "" when no block is usable. */
export function compileFilterXml(blocks: TypeBlockNode[], opts: CompileOptions): string {
  const usable = usableBlocks(blocks);
  if (usable.length === 0) return "";
  if (usable.length === 1) return blockToXml(usable[0], opts);
  return `<filter type="or">${usable.map((b) => blockToXml(b, opts)).join("")}</filter>`;
}

/** Full preview fetch: selected columns, ordered, capped at `top`. */
export function compileFetchXml(blocks: TypeBlockNode[], opts: CompileOptions): string {
  const filter = compileFilterXml(blocks, opts);
  if (!filter) return "";
  const attrs = opts.selectAttributes.map((a) => `<attribute name="${escapeXml(a)}" />`).join("");
  const order = `<order attribute="${escapeXml(opts.orderBy ?? opts.selectAttributes[0])}" />`;
  const top = opts.top ? ` top="${opts.top}"` : "";
  return `<fetch${top}><entity name="${escapeXml(opts.entityName)}">${attrs}${order}${filter}</entity></fetch>`;
}

/** Aggregate count fetch for the total match count (independent of the preview cap). */
export function compileCountFetchXml(blocks: TypeBlockNode[], opts: CompileOptions): string {
  const filter = compileFilterXml(blocks, opts);
  if (!filter) return "";
  const idAttr = `${opts.entityName}id`;
  return (
    `<fetch aggregate="true"><entity name="${escapeXml(opts.entityName)}">` +
    `<attribute name="${idAttr}" alias="matchcount" aggregate="count" />` +
    `${filter}</entity></fetch>`
  );
}
