/**
 * Criteria tree -> FetchXML. Pure functions, no Dataverse dependency —
 * this is the unit-tested core of the control.
 *
 * MULTI-TYPE VARIANT shape:
 *  - one type-pinning condition covering every selected object type:
 *    `eq` for a single type, `in` with <value> children for several;
 *  - the shared root group is flattened into the pinning filter when it is AND,
 *    or nested as its own <filter type="or"> when it is ANY;
 *  - nested groups become nested <filter> elements at arbitrary depth.
 */

import { ConditionNode, GroupNode, IN_DELIMITER, ScopeSetFilter } from "./types";

export interface CompileOptions {
  /** Logical name of the CMDB objects table, e.g. grc_jiraobject. */
  entityName: string;
  /** Column holding the object type, e.g. grc_objecttype. */
  typeAttribute: string;
  /** Columns to select in the preview query. */
  selectAttributes: string[];
  /** Row cap for the preview (fetch top). Omit for no cap. */
  top?: number;
  /** When set, adds `<activeAttribute> eq 1` (Yes/No column). */
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

/** True when the tree has at least one complete condition somewhere. */
export function hasCriteria(filter: ScopeSetFilter): boolean {
  return groupChildrenXml(filter.root) !== "";
}

/** The type pin: `eq` for one type, `in` for several. */
function typePinXml(objectTypes: string[], typeAttribute: string): string {
  const types = objectTypes.map((t) => t.trim()).filter((t) => t !== "");
  const attr = escapeXml(typeAttribute);
  if (types.length === 0) return "";
  if (types.length === 1) {
    return `<condition attribute="${attr}" operator="eq" value="${escapeXml(types[0])}" />`;
  }
  const children = types.map((t) => `<value>${escapeXml(t)}</value>`).join("");
  return `<condition attribute="${attr}" operator="in">${children}</condition>`;
}

/** The complete <filter> for the scope set, or "" when no object type is selected. */
export function compileFilterXml(filter: ScopeSetFilter, opts: CompileOptions): string {
  const pin = typePinXml(filter.objectTypes, opts.typeAttribute);
  if (!pin) return "";
  const parts = [pin];
  if (opts.activeAttribute) {
    parts.push(`<condition attribute="${escapeXml(opts.activeAttribute)}" operator="eq" value="1" />`);
  }
  // An AND root flattens into the pinning filter; an OR root nests inside it,
  // so the type pin is never OR'd away.
  const inner = filter.root.logic === "and" ? groupChildrenXml(filter.root) : groupToXml(filter.root);
  return `<filter type="and">${parts.join("")}${inner}</filter>`;
}

/** Full preview fetch: selected columns, ordered, capped at `top`. */
export function compileFetchXml(filter: ScopeSetFilter, opts: CompileOptions): string {
  const filterXml = compileFilterXml(filter, opts);
  if (!filterXml) return "";
  const attrs = opts.selectAttributes.map((a) => `<attribute name="${escapeXml(a)}" />`).join("");
  const order = `<order attribute="${escapeXml(opts.orderBy ?? opts.selectAttributes[0])}" />`;
  const top = opts.top ? ` top="${opts.top}"` : "";
  return `<fetch${top}><entity name="${escapeXml(opts.entityName)}">${attrs}${order}${filterXml}</entity></fetch>`;
}

/** Aggregate count fetch for the total match count (independent of the preview cap). */
export function compileCountFetchXml(filter: ScopeSetFilter, opts: CompileOptions): string {
  const filterXml = compileFilterXml(filter, opts);
  if (!filterXml) return "";
  const idAttr = `${opts.entityName}id`;
  return (
    `<fetch aggregate="true"><entity name="${escapeXml(opts.entityName)}">` +
    `<attribute name="${idAttr}" alias="matchcount" aggregate="count" />` +
    `${filterXml}</entity></fetch>`
  );
}
