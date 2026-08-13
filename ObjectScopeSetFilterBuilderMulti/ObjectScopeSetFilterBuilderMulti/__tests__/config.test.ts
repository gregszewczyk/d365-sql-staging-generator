import {
  attributeGapTypes,
  attributesForContext,
  BuilderConfig,
  DEFAULT_CONFIG,
  impliedTypesFromPath,
  intersectAttributes,
  isTypeAttribute,
  resolveConfig,
  typeAttributeDef,
  unionAttributes
} from "../model/config";
import { ConditionNode, GroupLogic, GroupNode, Operator } from "../model/types";

const config: BuilderConfig = DEFAULT_CONFIG;
const TYPE = config.typeAttribute;
const names = (defs: { logicalName: string }[]) => defs.map((d) => d.logicalName).sort();

let n = 0;
const cond = (attribute: string, operator: Operator, value: string): ConditionNode => ({
  id: `c${++n}`,
  attribute,
  operator,
  value
});
const group = (logic: GroupLogic, conditions: ConditionNode[]): GroupNode => ({
  id: `g${++n}`,
  logic,
  conditions,
  groups: []
});

describe("typeAttributeDef", () => {
  it("exposes the type column as a choice attribute over the configured types", () => {
    const def = typeAttributeDef(config);
    expect(def.logicalName).toBe(TYPE);
    expect(def.kind).toBe("choice");
    expect(def.options?.map((o) => o.value)).toEqual(["Application", "Server", "Service"]);
    expect(isTypeAttribute(config, TYPE)).toBe(true);
    expect(isTypeAttribute(config, "grc_os")).toBe(false);
  });
});

describe("impliedTypesFromPath", () => {
  it("is null (unconstrained) when no type condition is in AND context", () => {
    expect(impliedTypesFromPath(config, [group("and", [cond("grc_owner", "eq", "alice")])])).toBeNull();
  });

  it("narrows on an eq type condition in the same AND group", () => {
    expect(impliedTypesFromPath(config, [group("and", [cond(TYPE, "eq", "Server")])])).toEqual(["Server"]);
  });

  it("narrows on an in type condition", () => {
    expect(impliedTypesFromPath(config, [group("and", [cond(TYPE, "in", "Server;Application")])])).toEqual([
      "Server",
      "Application"
    ]);
  });

  it("treats ne as everything else", () => {
    expect(impliedTypesFromPath(config, [group("and", [cond(TYPE, "ne", "Server")])])).toEqual([
      "Application",
      "Service"
    ]);
  });

  it("inherits an ancestor AND group's constraint", () => {
    const path = [group("and", [cond(TYPE, "eq", "Server")]), group("or", [cond("grc_os", "eq", "Windows")])];
    expect(impliedTypesFromPath(config, path)).toEqual(["Server"]);
  });

  it("ignores type conditions inside OR groups, which are alternatives not constraints", () => {
    const path = [group("or", [cond(TYPE, "eq", "Server"), cond(TYPE, "eq", "Application")])];
    expect(impliedTypesFromPath(config, path)).toBeNull();
  });

  it("intersects multiple AND-context type conditions", () => {
    const path = [
      group("and", [cond(TYPE, "in", "Server;Application")]),
      group("and", [cond(TYPE, "eq", "Server")])
    ];
    expect(impliedTypesFromPath(config, path)).toEqual(["Server"]);
  });

  it("yields an empty (unsatisfiable) context for contradictory conditions", () => {
    const path = [group("and", [cond(TYPE, "eq", "Server"), cond(TYPE, "eq", "Application")])];
    expect(impliedTypesFromPath(config, path)).toEqual([]);
  });

  it("ignores incomplete and non-narrowing type conditions", () => {
    expect(impliedTypesFromPath(config, [group("and", [cond(TYPE, "eq", "")])])).toBeNull();
    expect(impliedTypesFromPath(config, [group("and", [cond(TYPE, "like", "Serv")])])).toBeNull();
  });
});

describe("attributesForContext", () => {
  it("always offers the object type itself", () => {
    expect(attributesForContext(config, null)[0].logicalName).toBe(TYPE);
    expect(attributesForContext(config, ["Server"])[0].logicalName).toBe(TYPE);
  });

  it("offers the union when unconstrained", () => {
    const all = names(attributesForContext(config, null));
    expect(all).toContain("grc_os");
    expect(all).toContain("grc_internetfacing");
  });

  it("offers only shared attributes when several types are in context", () => {
    const shared = names(attributesForContext(config, ["Server", "Application"]));
    expect(shared).toContain("grc_criticality");
    expect(shared).not.toContain("grc_os");
    expect(shared).not.toContain("grc_internetfacing");
  });

  it("offers a single type's own attributes", () => {
    expect(names(attributesForContext(config, ["Server"]))).toEqual([
      "grc_criticality",
      "grc_environment",
      "grc_objecttype",
      "grc_os",
      "grc_owner"
    ]);
  });

  it("offers only the type attribute for an unsatisfiable context", () => {
    expect(names(attributesForContext(config, []))).toEqual([TYPE]);
  });
});

describe("attributeGapTypes", () => {
  it("names the context types lacking the attribute", () => {
    expect(attributeGapTypes(config, ["Server", "Application"], "grc_os")).toEqual(["Application"]);
  });

  it("is empty for a shared attribute, the type column, and unconstrained context", () => {
    expect(attributeGapTypes(config, ["Server", "Application"], "grc_criticality")).toEqual([]);
    expect(attributeGapTypes(config, ["Server", "Application"], TYPE)).toEqual([]);
    expect(attributeGapTypes(config, null, "grc_os")).toEqual([]);
  });
});

describe("intersect / union helpers", () => {
  it("intersect returns nothing for unknown types", () => {
    expect(intersectAttributes(config, ["NotAType"])).toEqual([]);
  });

  it("union de-duplicates by logical name", () => {
    const all = names(unionAttributes(config, ["Server", "Application"]));
    expect(all.filter((a) => a === "grc_criticality")).toHaveLength(1);
  });
});

describe("resolveConfig", () => {
  it("falls back to defaults for empty input", () => {
    expect(resolveConfig(null).config.jiraObjectEntity).toBe("grc_jiraobject");
    expect(resolveConfig("  ").error).toBeUndefined();
  });

  it("merges criterionColumns over the defaults", () => {
    const { config: merged, error } = resolveConfig(
      JSON.stringify({ criterionColumns: { scopeSetNav: "grc_ObjectScopeSetID" } })
    );
    expect(error).toBeUndefined();
    expect(merged.criterionColumns.scopeSetNav).toBe("grc_ObjectScopeSetID");
    expect(merged.criterionColumns.scopeSetEntitySet).toBe("grc_objectscopesets");
  });

  it("reports invalid JSON and keeps defaults", () => {
    const { config: fallback, error } = resolveConfig("{not json");
    expect(error).toContain("not valid JSON");
    expect(fallback.jiraObjectEntity).toBe("grc_jiraobject");
  });
});
