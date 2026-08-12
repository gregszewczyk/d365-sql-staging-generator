import {
  attributeGapTypes,
  BuilderConfig,
  DEFAULT_CONFIG,
  intersectAttributes,
  resolveConfig,
  unionAttributes
} from "../model/config";

const config: BuilderConfig = DEFAULT_CONFIG;
const names = (defs: { logicalName: string }[]) => defs.map((d) => d.logicalName).sort();

describe("intersectAttributes", () => {
  it("returns a single type's own attributes", () => {
    expect(names(intersectAttributes(config, ["Server"]))).toEqual([
      "grc_criticality",
      "grc_environment",
      "grc_os",
      "grc_owner"
    ]);
  });

  it("drops attributes that do not apply to every selected type", () => {
    // Server has OS but no internet-facing; Application is the reverse.
    const shared = names(intersectAttributes(config, ["Server", "Application"]));
    expect(shared).toEqual(["grc_criticality", "grc_environment", "grc_owner"]);
    expect(shared).not.toContain("grc_os");
    expect(shared).not.toContain("grc_internetfacing");
  });

  it("returns nothing when no type is selected", () => {
    expect(intersectAttributes(config, [])).toEqual([]);
  });

  it("ignores unknown type values", () => {
    expect(intersectAttributes(config, ["NotAType"])).toEqual([]);
  });
});

describe("unionAttributes", () => {
  it("includes attributes from any selected type, without duplicates", () => {
    const all = names(unionAttributes(config, ["Server", "Application"]));
    expect(all).toContain("grc_os");
    expect(all).toContain("grc_internetfacing");
    expect(all.filter((a) => a === "grc_criticality")).toHaveLength(1);
  });
});

describe("attributeGapTypes", () => {
  it("is empty for an attribute shared by all selected types", () => {
    expect(attributeGapTypes(config, ["Server", "Application"], "grc_criticality")).toEqual([]);
  });

  it("names the types that lack the attribute", () => {
    expect(attributeGapTypes(config, ["Server", "Application"], "grc_os")).toEqual(["Application"]);
    expect(attributeGapTypes(config, ["Server", "Application"], "grc_internetfacing")).toEqual(["Server"]);
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
    // untouched keys survive
    expect(merged.criterionColumns.scopeSetEntitySet).toBe("grc_objectscopesets");
  });

  it("reports invalid JSON and keeps defaults", () => {
    const { config: fallback, error } = resolveConfig("{not json");
    expect(error).toContain("not valid JSON");
    expect(fallback.jiraObjectEntity).toBe("grc_jiraobject");
  });
});
