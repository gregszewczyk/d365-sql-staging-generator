/**
 * Criteria tree — the in-memory shape the builder UI edits.
 *
 * Object type is NOT special. It is an ordinary condition on the type column,
 * combinable with AND/OR like any other attribute, so a scope set can express
 * things neither earlier design could:
 *
 *   (Type = Office AND Location = Germany) OR (Type = Product)
 *
 * This supersedes both earlier designs rather than adding to them: per-type
 * blocks are just AND groups each containing a type condition, and a shared
 * type list is a single `Type in (...)` condition near the root.
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

/** The whole filter is now just a criteria tree. */
export interface ScopeSetFilter {
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
  /** Stored value used in object-type conditions. */
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

/** Delimiter for the derived type list denormalised onto grc_sourceobjecttype. */
export const TYPE_DELIMITER = ";";
