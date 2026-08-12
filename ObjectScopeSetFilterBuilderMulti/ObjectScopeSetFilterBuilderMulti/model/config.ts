import { AttributeDef, ObjectTypeDef } from "./types";

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
 * Attributes offered when several object types are selected: the INTERSECTION,
 * i.e. only attributes defined for every selected type.
 *
 * Intersection rather than union is a correctness decision, not conservatism.
 * Offering (say) OS while Applications are in scope would silently drop every
 * Application from the results, because a condition never matches a null — the
 * user would get a smaller answer than they asked for with nothing to explain
 * it. Attributes that don't apply everywhere are surfaced as warnings on
 * existing conditions instead (see attributeGapTypes).
 *
 * Definitions are taken from the first selected type that declares the
 * attribute, so labels/kinds/options stay consistent.
 */
export function intersectAttributes(config: BuilderConfig, objectTypes: string[]): AttributeDef[] {
  const defs = objectTypes.map((v) => findObjectType(config, v)).filter((t): t is ObjectTypeDef => !!t);
  if (defs.length === 0) return [];
  const [first, ...rest] = defs;
  return first.attributes.filter((a) =>
    rest.every((t) => t.attributes.some((b) => b.logicalName === a.logicalName))
  );
}

/** Union of the selected types' attributes — used to resolve loaded conditions. */
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
 * Which of the selected types do NOT have this attribute. Empty means the
 * attribute applies everywhere; a non-empty result is what the UI warns about
 * rather than deleting the user's condition.
 */
export function attributeGapTypes(
  config: BuilderConfig,
  objectTypes: string[],
  logicalName: string
): string[] {
  return objectTypes.filter((v) => {
    const def = findObjectType(config, v);
    return !def || !def.attributes.some((a) => a.logicalName === logicalName);
  });
}
