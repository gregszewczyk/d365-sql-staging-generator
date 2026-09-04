import { AttributeDef, GroupNode, ObjectTypeDef } from "./types";

/**
 * All Dataverse names the control touches, in one place.
 *
 * The brief's names are design intent, not verified logical names, so every
 * one of them can be overridden via the control's `configJson` input property
 * without a code change. See README.md for the JSON shape.
 */
export interface CriterionColumnNames {
  name: string;
  sourceObjectType: string;
  attribute: string;
  operator: string;
  value: string;
  groupId: string;
  groupLogic: string;
  sequence: string;
  /** Logical name of the lookup to the scope set (used for _<name>_value filtering). */
  scopeSetLookup: string;
  /** Schema name of the lookup's navigation property (used for @odata.bind). */
  scopeSetNav: string;
  /** Entity-set name of the scope set table (plural, used in @odata.bind path). */
  scopeSetEntitySet: string;
}

/**
 * Optional maps for environments where grc_operator / grc_grouplogic /
 * grc_sourceobjecttype are Choice columns rather than Text. Keys are the
 * builder's string values ("eq", "and", "Application"...), values are the
 * choice's numeric option values. When a map is present the control writes
 * numbers and reverse-maps them on load; when absent it writes strings.
 */
export interface ChoiceMaps {
  operator?: Record<string, number>;
  groupLogic?: Record<string, number>;
  sourceObjectType?: Record<string, number>;
}

export interface BuilderConfig {
  /** CMDB objects table. */
  jiraObjectEntity: string;
  jiraObjectPrimaryName: string;
  /** Column on the CMDB table holding the object type. */
  typeAttribute: string;
  /** Yes/No column flagging live objects; null disables the "active only" toggle. */
  activeAttribute: string | null;
  /** URL column with the deep link back to Jira; null hides the link. */
  objectUrlAttribute: string | null;

  criterionEntity: string;
  criterionColumns: CriterionColumnNames;
  choiceMaps: ChoiceMaps;

  /**
   * Write-back onto the scope set record on save, so the nightly evaluation job
   * has the query without re-deriving it from criterion rows. Set either column
   * to null to skip writing it.
   */
  scopeSetEntity: string;
  /** Multiline text column receiving the compiled, UNCAPPED FetchXML. */
  fetchXmlAttribute: string | null;
  /** DateTime column stamped when criteria are saved. */
  lastEvaluatedAttribute: string | null;

  /** Object types offered by the builder and their filterable attributes. */
  objectTypes: ObjectTypeDef[];
}

const ENV_OPTIONS = [
  { value: "Production", label: "Production" },
  { value: "Pre-Production", label: "Pre-Production" },
  { value: "Test", label: "Test" },
  { value: "Development", label: "Development" }
];

const CRIT_OPTIONS = [
  { value: "Tier 1", label: "Tier 1" },
  { value: "Tier 2", label: "Tier 2" },
  { value: "Tier 3", label: "Tier 3" }
];

/** Default attribute catalogue — replace/extend via configJson once real schema is confirmed. */
const DEFAULT_OBJECT_TYPES: ObjectTypeDef[] = [
  {
    value: "Application",
    label: "Application",
    attributes: [
      { logicalName: "grc_environment", label: "Environment", kind: "choice", options: ENV_OPTIONS },
      { logicalName: "grc_criticality", label: "Criticality", kind: "choice", options: CRIT_OPTIONS },
      { logicalName: "grc_internetfacing", label: "Internet-facing", kind: "boolean" },
      { logicalName: "grc_owner", label: "Owner", kind: "text" }
    ]
  },
  {
    value: "Server",
    label: "Server",
    attributes: [
      { logicalName: "grc_os", label: "Operating system", kind: "text" },
      { logicalName: "grc_environment", label: "Environment", kind: "choice", options: ENV_OPTIONS },
      { logicalName: "grc_criticality", label: "Criticality", kind: "choice", options: CRIT_OPTIONS },
      { logicalName: "grc_owner", label: "Owner", kind: "text" }
    ]
  },
  {
    value: "Service",
    label: "Service",
    attributes: [
      { logicalName: "grc_environment", label: "Environment", kind: "choice", options: ENV_OPTIONS },
      { logicalName: "grc_criticality", label: "Criticality", kind: "choice", options: CRIT_OPTIONS },
      { logicalName: "grc_owner", label: "Owner", kind: "text" }
    ]
  }
];

export const DEFAULT_CONFIG: BuilderConfig = {
  jiraObjectEntity: "grc_jiraobject",
  jiraObjectPrimaryName: "grc_name",
  typeAttribute: "grc_objecttype",
  activeAttribute: "grc_isactive",
  objectUrlAttribute: "grc_objecturl",

  criterionEntity: "grc_filtercriterion",
  criterionColumns: {
    name: "grc_name",
    sourceObjectType: "grc_sourceobjecttype",
    attribute: "grc_attribute",
    operator: "grc_operator",
    value: "grc_value",
    groupId: "grc_groupid",
    groupLogic: "grc_grouplogic",
    sequence: "grc_sequence",
    scopeSetLookup: "grc_objectscopesetid",
    scopeSetNav: "grc_ObjectScopeSetId",
    scopeSetEntitySet: "grc_objectscopesets"
  },
  choiceMaps: {},

  scopeSetEntity: "grc_objectscopeset",
  fetchXmlAttribute: "grc_fetchxml",
  lastEvaluatedAttribute: "grc_lastevaluatedon",

  objectTypes: DEFAULT_OBJECT_TYPES
};

/** Deep-merge a (partial) parsed configJson over the defaults. */
export function resolveConfig(raw: string | null | undefined): { config: BuilderConfig; error?: string } {
  if (!raw || !raw.trim()) {
    return { config: DEFAULT_CONFIG };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BuilderConfig>;
    const config: BuilderConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      criterionColumns: { ...DEFAULT_CONFIG.criterionColumns, ...(parsed.criterionColumns ?? {}) },
      choiceMaps: { ...DEFAULT_CONFIG.choiceMaps, ...(parsed.choiceMaps ?? {}) },
      objectTypes:
        parsed.objectTypes && parsed.objectTypes.length > 0 ? parsed.objectTypes : DEFAULT_CONFIG.objectTypes
    };
    return { config };
  } catch (e) {
    return { config: DEFAULT_CONFIG, error: `configJson is not valid JSON (${(e as Error).message}); using defaults.` };
  }
}

export function findObjectType(config: BuilderConfig, value: string): ObjectTypeDef | undefined {
  return config.objectTypes.find((t) => t.value === value);
}

/**
 * The object-type column presented as a normal attribute, so the picker can
 * offer it alongside Location, Criticality and the rest. This is what makes
 * type "just another condition".
 */
export function typeAttributeDef(config: BuilderConfig): AttributeDef {
  return {
    logicalName: config.typeAttribute,
    label: "Object type",
    kind: "choice",
    options: config.objectTypes.map((t) => ({ value: t.value, label: t.label }))
  };
}

export function isTypeAttribute(config: BuilderConfig, logicalName: string): boolean {
  return logicalName === config.typeAttribute;
}

/**
 * The set of object types a condition can apply to, given the type conditions
 * that AND-constrain it (see impliedTypesFromPath). `null` means unconstrained.
 */
export type TypeContext = string[] | null;

/**
 * Narrow a type context by one type condition.
 *
 * Only AND context is sound: a type condition inside an OR group is an
 * alternative to its siblings, not a constraint on them, so callers must not
 * feed those in here.
 */
function narrow(config: BuilderConfig, current: TypeContext, operator: string, value: string): TypeContext {
  const all = config.objectTypes.map((t) => t.value);
  const listed = value
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  if (listed.length === 0) return current;

  let allowed: string[];
  switch (operator) {
    case "eq":
    case "in":
      allowed = listed;
      break;
    case "ne":
      allowed = all.filter((t) => listed.indexOf(t) < 0);
      break;
    default:
      // like/gt/lt on the type column tell us nothing useful.
      return current;
  }
  return current === null ? allowed : current.filter((t) => allowed.indexOf(t) >= 0);
}

/**
 * Infer which object types are in play for conditions in the group at the end
 * of `path` (root first, target group last).
 *
 * Within an AND group, a `Type = Office` condition means every sibling applies
 * only to Offices — so walking the AND ancestors collects a sound constraint.
 * OR groups contribute nothing, since their members are alternatives.
 *
 * Returns null when no type condition constrains the group, i.e. the condition
 * could apply to any object type.
 */
export function impliedTypesFromPath(config: BuilderConfig, path: GroupNode[]): TypeContext {
  let ctx: TypeContext = null;
  for (const group of path) {
    if (group.logic !== "and") continue;
    for (const c of group.conditions) {
      if (isTypeAttribute(config, c.attribute) && c.value.trim() !== "") {
        ctx = narrow(config, ctx, c.operator, c.value);
      }
    }
  }
  return ctx;
}

/**
 * Attributes to offer for a condition in the given type context.
 *
 * Constrained context -> the INTERSECTION of those types' attributes, so the
 * picker cannot produce a condition that silently excludes part of the result.
 * Offering (say) OS where Offices are in scope would drop every Office, because
 * a condition never matches a null.
 *
 * Unconstrained context -> the union, since we cannot know which type applies;
 * such conditions are flagged by attributeGapTypes once a type is pinned.
 *
 * The object-type attribute itself is always offered.
 */
export function attributesForContext(config: BuilderConfig, ctx: TypeContext): AttributeDef[] {
  const attrs = ctx === null ? unionAttributes(config, config.objectTypes.map((t) => t.value))
                             : intersectAttributes(config, ctx);
  return [typeAttributeDef(config), ...attrs];
}

/** Intersection of the given types' attributes (empty when no type resolves). */
export function intersectAttributes(config: BuilderConfig, objectTypes: string[]): AttributeDef[] {
  const defs = objectTypes.map((v) => findObjectType(config, v)).filter((t): t is ObjectTypeDef => !!t);
  if (defs.length === 0) return [];
  const [first, ...rest] = defs;
  return first.attributes.filter((a) =>
    rest.every((t) => t.attributes.some((b) => b.logicalName === a.logicalName))
  );
}

/** Union of the given types' attributes, de-duplicated by logical name. */
export function unionAttributes(config: BuilderConfig, objectTypes: string[]): AttributeDef[] {
  const seen = new Map<string, AttributeDef>();
  objectTypes.forEach((v) => {
    findObjectType(config, v)?.attributes.forEach((a) => {
      if (!seen.has(a.logicalName)) seen.set(a.logicalName, a);
    });
  });
  return Array.from(seen.values());
}

/**
 * Which types in the context do NOT have this attribute. Empty means it applies
 * throughout; a non-empty result is what the UI flags rather than deleting the
 * user's condition. Always empty for the type attribute itself, and for an
 * unconstrained context (nothing is known to be excluded yet).
 */
export function attributeGapTypes(
  config: BuilderConfig,
  ctx: TypeContext,
  logicalName: string
): string[] {
  if (ctx === null || isTypeAttribute(config, logicalName)) return [];
  return ctx.filter((v) => {
    const def = findObjectType(config, v);
    return !def || !def.attributes.some((a) => a.logicalName === logicalName);
  });
}
