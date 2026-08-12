import { buildTree, CriterionRow, flattenTree, parseTypes, serialiseTypes } from "../model/persistence";
import { ConditionNode, GroupNode, Operator, ScopeSetFilter } from "../model/types";

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
const filter = (objectTypes: string[], root: GroupNode): ScopeSetFilter => ({ objectTypes, root });

/** Strip UI-only ids so filters can be compared structurally. */
const strip = (f: ScopeSetFilter) => ({ objectTypes: f.objectTypes, root: stripGroup(f.root) });
const stripGroup = (g: GroupNode): unknown => ({
  logic: g.logic,
  conditions: g.conditions.map((c) => ({ attribute: c.attribute, operator: c.operator, value: c.value })),
  groups: g.groups.map(stripGroup)
});

describe("type list serialisation", () => {
  it("writes a single type as a plain value, byte-identical to the original control", () => {
    expect(serialiseTypes(["Server"])).toBe("Server");
  });

  it("delimits only when there are several types", () => {
    expect(serialiseTypes(["Server", "Application"])).toBe("Server;Application");
  });

  it("parses both forms, ignoring blanks", () => {
    expect(parseTypes("Server")).toEqual(["Server"]);
    expect(parseTypes("Server;Application")).toEqual(["Server", "Application"]);
    expect(parseTypes("Server; ;Application")).toEqual(["Server", "Application"]);
    expect(parseTypes("")).toEqual([]);
  });
});

describe("flattenTree", () => {
  it("stamps every row with the shared type list and encodes group paths", () => {
    const f = filter(
      ["Server", "Application"],
      group(
        "and",
        [cond("grc_criticality", "eq", "Tier 1"), cond("", "eq", "ignored")],
        [group("or", [cond("grc_environment", "eq", "Production")])]
      )
    );
    const rows = flattenTree(f);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceObjectType: "Server;Application",
      attribute: "grc_criticality",
      groupId: "0a",
      groupLogic: "and",
      name: "grc_criticality equals Tier 1"
    });
    expect(rows[1]).toMatchObject({
      sourceObjectType: "Server;Application",
      attribute: "grc_environment",
      groupId: "0a.0o",
      groupLogic: "or"
    });
    expect(rows[1].sequence).toBeGreaterThan(rows[0].sequence);
  });

  it("writes nothing when no object type is selected", () => {
    expect(flattenTree(filter([], group("and", [cond("grc_os", "eq", "Windows")])))).toEqual([]);
  });
});

describe("buildTree / round trip", () => {
  it("rebuilds the exact structure, types and nesting from flattened rows", () => {
    const original = filter(
      ["Application", "Server"],
      group(
        "and",
        [cond("grc_environment", "eq", "Production"), cond("grc_criticality", "eq", "Tier 1")],
        [
          group("or", [cond("grc_owner", "eq", "alice"), cond("grc_owner", "eq", "bob")]),
          group("and", [cond("grc_environment", "like", "prod")])
        ]
      )
    );
    const { filter: rebuilt, converted } = buildTree(flattenTree(original));
    expect(converted).toBe(false);
    expect(strip(rebuilt)).toEqual(strip(original));
  });

  it("round-trips an OR root", () => {
    const original = filter(
      ["Server"],
      group("or", [cond("grc_os", "like", "Windows"), cond("grc_os", "like", "Linux")])
    );
    const { filter: rebuilt } = buildTree(flattenTree(original));
    expect(strip(rebuilt)).toEqual(strip(original));
  });

  it("carries Dataverse row ids through to the rebuilt conditions", () => {
    const rows = flattenTree(
      filter(["Server"], group("and", [cond("grc_os", "eq", "Windows", "11111111-1111-1111-1111-111111111111")]))
    );
    expect(rows[0].id).toBe("11111111-1111-1111-1111-111111111111");
    const { filter: rebuilt } = buildTree(rows);
    expect(rebuilt.root.conditions[0].criterionId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns an empty editable filter for no rows", () => {
    const { filter: rebuilt, converted } = buildTree([]);
    expect(converted).toBe(false);
    expect(rebuilt.objectTypes).toEqual([]);
    expect(rebuilt.root.conditions).toHaveLength(1);
  });
});

describe("reading rows written by the original (per-block) control", () => {
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

  it("loads a single-block filter unchanged", () => {
    const rows = [legacyRow("Server", "grc_os", "Windows", "0a", 10)];
    const { filter: loaded, converted } = buildTree(rows);
    expect(converted).toBe(false);
    expect(loaded.objectTypes).toEqual(["Server"]);
    expect(loaded.root.logic).toBe("and");
    expect(loaded.root.conditions[0].attribute).toBe("grc_os");
  });

  it("unions the types and ORs former blocks together, flagging the conversion", () => {
    const rows = [
      legacyRow("Application", "grc_environment", "Production", "0a", 10),
      legacyRow("Server", "grc_os", "Windows", "1a", 20)
    ];
    const { filter: loaded, converted } = buildTree(rows);
    expect(converted).toBe(true);
    expect(loaded.objectTypes).toEqual(["Application", "Server"]);
    expect(loaded.root.logic).toBe("or");
    expect(loaded.root.groups).toHaveLength(2);
    expect(loaded.root.groups[0].conditions[0].attribute).toBe("grc_environment");
    expect(loaded.root.groups[1].conditions[0].attribute).toBe("grc_os");
  });

  it("does not duplicate a type that appeared in several blocks", () => {
    const rows = [
      legacyRow("Server", "grc_os", "Windows", "0a", 10),
      legacyRow("Server", "grc_os", "Linux", "1a", 20)
    ];
    const { filter: loaded } = buildTree(rows);
    expect(loaded.objectTypes).toEqual(["Server"]);
  });

  it("tolerates a foreign groupId format by treating it as the root group", () => {
    const rows = [legacyRow("Server", "grc_os", "Windows", "legacy-group-1", 10)];
    const { filter: loaded, converted } = buildTree(rows);
    expect(converted).toBe(false);
    expect(loaded.root.conditions[0].attribute).toBe("grc_os");
  });
});
