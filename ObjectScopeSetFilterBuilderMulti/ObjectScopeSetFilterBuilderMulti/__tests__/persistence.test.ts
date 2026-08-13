import { buildTree, CriterionRow, deriveTypes, flattenTree, parseTypes, serialiseTypes } from "../model/persistence";
import { ConditionNode, GroupNode, Operator, ScopeSetFilter } from "../model/types";

const TYPE = "grc_objecttype";

let n = 0;
const cond = (attribute: string, operator: Operator, value: string, criterionId?: string): ConditionNode => ({
  id: `c${++n}`,
  criterionId,
  attribute,
  operator,
  value
});
const group = (logic: "and" | "or", conditions: ConditionNode[], groups: GroupNode[] = []): GroupNode => ({
  id: `g${++n}`,
  logic,
  conditions,
  groups
});
const filter = (root: GroupNode): ScopeSetFilter => ({ root });

/** Strip UI-only ids so trees can be compared structurally. */
const strip = (f: ScopeSetFilter) => stripGroup(f.root);
const stripGroup = (g: GroupNode): unknown => ({
  logic: g.logic,
  conditions: g.conditions.map((c) => ({ attribute: c.attribute, operator: c.operator, value: c.value })),
  groups: g.groups.map(stripGroup)
});

describe("type list serialisation", () => {
  it("round-trips single and multiple values", () => {
    expect(serialiseTypes(["Server"])).toBe("Server");
    expect(serialiseTypes(["Server", "Application"])).toBe("Server;Application");
    expect(parseTypes("Server; ;Application")).toEqual(["Server", "Application"]);
    expect(parseTypes("")).toEqual([]);
  });
});

describe("deriveTypes (denormalised grc_sourceobjecttype)", () => {
  it("collects types from eq and in conditions at any depth, de-duplicated", () => {
    const f = filter(
      group(
        "or",
        [cond(TYPE, "eq", "Product")],
        [group("and", [cond(TYPE, "in", "Office;Product"), cond("grc_location", "eq", "DE")])]
      )
    );
    expect(deriveTypes(f, TYPE)).toEqual(["Product", "Office"]);
  });

  it("ignores negative type conditions, which say nothing about coverage", () => {
    expect(deriveTypes(filter(group("and", [cond(TYPE, "ne", "Office")])), TYPE)).toEqual([]);
  });

  it("is empty when the filter never constrains type", () => {
    expect(deriveTypes(filter(group("and", [cond("grc_location", "eq", "DE")])), TYPE)).toEqual([]);
  });
});

describe("flattenTree", () => {
  it("stores type conditions as ordinary rows and stamps the derived list on every row", () => {
    const f = filter(
      group(
        "or",
        [cond(TYPE, "eq", "Product")],
        [group("and", [cond(TYPE, "eq", "Office"), cond("grc_location", "eq", "Germany")])]
      )
    );
    const rows = flattenTree(f, TYPE);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.sourceObjectType === "Product;Office")).toBe(true);
    expect(rows[0]).toMatchObject({ attribute: TYPE, value: "Product", groupId: "0o", groupLogic: "or" });
    expect(rows[1]).toMatchObject({ attribute: TYPE, value: "Office", groupId: "0o.0a", groupLogic: "and" });
    expect(rows[2]).toMatchObject({ attribute: "grc_location", value: "Germany", groupId: "0o.0a" });
  });

  it("skips conditions with no attribute", () => {
    const rows = flattenTree(filter(group("and", [cond("", "eq", "x"), cond(TYPE, "eq", "Office")])), TYPE);
    expect(rows).toHaveLength(1);
  });

  it("derives a name for each row", () => {
    const rows = flattenTree(filter(group("and", [cond("grc_os", "like", "Windows")])), TYPE);
    expect(rows[0].name).toBe("grc_os contains Windows");
  });
});

describe("buildTree / round trip", () => {
  it("round-trips the customer's example exactly", () => {
    const original = filter(
      group(
        "or",
        [cond(TYPE, "eq", "Product")],
        [group("and", [cond(TYPE, "eq", "Office"), cond("grc_location", "eq", "Germany")])]
      )
    );
    const { filter: rebuilt, converted } = buildTree(flattenTree(original, TYPE), TYPE);
    expect(converted).toBe(false);
    expect(strip(rebuilt)).toEqual(strip(original));
  });

  it("round-trips deep nesting", () => {
    const original = filter(
      group(
        "and",
        [cond(TYPE, "in", "Server;Application")],
        [
          group("or", [cond("grc_criticality", "eq", "Tier 1"), cond("grc_criticality", "eq", "Tier 2")]),
          group("and", [cond("grc_owner", "eq", "alice")], [group("or", [cond("grc_environment", "eq", "Test")])])
        ]
      )
    );
    const { filter: rebuilt } = buildTree(flattenTree(original, TYPE), TYPE);
    expect(strip(rebuilt)).toEqual(strip(original));
  });

  it("carries Dataverse row ids through", () => {
    const rows = flattenTree(
      filter(group("and", [cond(TYPE, "eq", "Office", "11111111-1111-1111-1111-111111111111")])),
      TYPE
    );
    expect(rows[0].id).toBe("11111111-1111-1111-1111-111111111111");
    const { filter: rebuilt } = buildTree(rows, TYPE);
    expect(rebuilt.root.conditions[0].criterionId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns an empty editable filter for no rows", () => {
    const { filter: rebuilt, converted } = buildTree([], TYPE);
    expect(converted).toBe(false);
    expect(rebuilt.root.conditions).toHaveLength(1);
  });
});

describe("upgrading rows saved by earlier designs", () => {
  const legacyRow = (
    sourceObjectType: string,
    attribute: string,
    value: string,
    groupId: string,
    sequence: number
  ): CriterionRow => ({
    id: `id-${sequence}`,
    name: "",
    sourceObjectType,
    attribute,
    operator: "eq",
    value,
    groupId,
    groupLogic: groupId.endsWith("o") ? "or" : "and",
    sequence
  });

  it("injects a type condition for the shared-type-list shape", () => {
    const rows = [
      legacyRow("Server;Application", "grc_criticality", "Tier 1", "0a", 10),
      legacyRow("Server;Application", "grc_environment", "Production", "0a", 20)
    ];
    const { filter: loaded, converted } = buildTree(rows, TYPE);
    expect(converted).toBe(true);
    expect(loaded.root.logic).toBe("and");
    expect(loaded.root.conditions[0]).toMatchObject({ attribute: TYPE, operator: "in", value: "Server;Application" });
    // Injected rows are new data, so they must not claim an existing row id.
    expect(loaded.root.conditions[0].criterionId).toBeUndefined();
    expect(loaded.root.conditions[1].attribute).toBe("grc_criticality");
  });

  it("uses eq when the legacy shape had a single type", () => {
    const rows = [legacyRow("Server", "grc_os", "Windows", "0a", 10)];
    const { filter: loaded } = buildTree(rows, TYPE);
    expect(loaded.root.conditions[0]).toMatchObject({ attribute: TYPE, operator: "eq", value: "Server" });
  });

  it("converts per-block rows losslessly: OR of AND groups, each keeping its own type", () => {
    const rows = [
      legacyRow("Application", "grc_environment", "Production", "0a", 10),
      legacyRow("Server", "grc_os", "Windows", "1a", 20)
    ];
    const { filter: loaded, converted } = buildTree(rows, TYPE);
    expect(converted).toBe(true);
    expect(loaded.root.logic).toBe("or");
    expect(loaded.root.groups).toHaveLength(2);
    expect(strip(loaded)).toEqual(
      strip(
        filter(
          group(
            "or",
            [],
            [
              group("and", [cond(TYPE, "eq", "Application"), cond("grc_environment", "eq", "Production")]),
              group("and", [cond(TYPE, "eq", "Server"), cond("grc_os", "eq", "Windows")])
            ]
          )
        )
      )
    );
  });

  it("wraps a legacy OR root so the injected type still constrains everything", () => {
    const rows = [
      legacyRow("Server", "grc_os", "Windows", "0o", 10),
      legacyRow("Server", "grc_os", "Linux", "0o", 20)
    ];
    const { filter: loaded } = buildTree(rows, TYPE);
    expect(loaded.root.logic).toBe("and");
    expect(loaded.root.conditions[0].attribute).toBe(TYPE);
    expect(loaded.root.groups[0].logic).toBe("or");
    expect(loaded.root.groups[0].conditions).toHaveLength(2);
  });

  it("does not inject anything when the rows already carry type conditions", () => {
    const rows = [
      legacyRow("Office", TYPE, "Office", "0a", 10),
      legacyRow("Office", "grc_location", "Germany", "0a", 20)
    ];
    const { filter: loaded, converted } = buildTree(rows, TYPE);
    expect(converted).toBe(false);
    expect(loaded.root.conditions).toHaveLength(2);
  });

  it("tolerates a foreign groupId format", () => {
    const rows = [legacyRow("Server", "grc_os", "Windows", "legacy-group-1", 10)];
    const { filter: loaded } = buildTree(rows, TYPE);
    expect(loaded.root.conditions.some((c) => c.attribute === "grc_os")).toBe(true);
  });
});
