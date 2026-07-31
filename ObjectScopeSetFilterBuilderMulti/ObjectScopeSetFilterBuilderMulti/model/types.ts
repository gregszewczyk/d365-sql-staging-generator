/**
 * Criteria tree — the in-memory shape the builder UI edits.
 *
 * A scope set is a list of type blocks (OR'd together). Each block pins one
 * source object type and owns a root group. Groups nest arbitrarily and
 * combine their members with AND or OR. Conditions live inside groups.
 */

export type GroupLogic = "and" | "or";

/** FetchXML condition operators supported by the builder. */
export type Operator = "eq" | "ne" | "like" | "in" | "gt" | "lt";

export const OPERATOR_LABELS: Record<Operator, string> = {
  eq: "equals",
  ne: "not equals",
  like: "contains",
  in: "in",
  gt: "greater than",
  lt: "less than"
};

export interface ConditionNode {
  /** UI-only id. */
  id: string;
  /** Dataverse grc_filtercriterion row id when this condition was loaded/saved. */
  criterionId?: string;
  attribute: string;
  operator: Operator;
  value: string;
}

export interface GroupNode {
  /** UI-only id. */
  id: string;
  logic: GroupLogic;
  conditions: ConditionNode[];
  groups: GroupNode[];
}

export interface TypeBlockNode {
  /** UI-only id. */
  id: string;
  /** Stored value of the source object type (e.g. "Application"). */
  objectType: string;
  root: GroupNode;
}

/** Attribute value editors the UI knows how to render. */
export type AttributeKind = "text" | "choice" | "boolean" | "number" | "datetime";

export interface AttributeDef {
  logicalName: string;
  label: string;
  kind: AttributeKind;
  /** For kind "choice": the selectable values (stored value + display label). */
  options?: { value: string; label: string }[];
}

export interface ObjectTypeDef {
  /** Stored value used in grc_objecttype conditions and grc_sourceobjecttype. */
  value: string;
  label: string;
  attributes: AttributeDef[];
}

/** Operators that make sense per attribute kind. */
export const OPERATORS_BY_KIND: Record<AttributeKind, Operator[]> = {
  text: ["eq", "ne", "like", "in"],
  choice: ["eq", "ne", "in"],
  boolean: ["eq", "ne"],
  number: ["eq", "ne", "gt", "lt"],
  datetime: ["eq", "ne", "gt", "lt"]
};

/** Delimiter for multi-value ("in") values stored in the single grc_value text column. */
export const IN_DELIMITER = ";";
