import { buildTree, CriterionRow, flattenTree } from "../model/persistence";
import { ConditionNode, GroupNode, Operator, TypeBlockNode } from "../model/types";

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
const block = (objectType: string, root: GroupNode): TypeBlockNode => ({ id: `b${++n}`, objectType, root });

/** Strip UI-only ids so trees can be compared structurally. */
const strip = (blocks: TypeBlockNode[]): unknown =>
  blocks.map((b) => ({
    objectType: b.objectType,
    root: stripGroup(b.root)
  }));
const stripGroup = (g: GroupNode): unknown => ({
  logic: g.logic,
  conditions: g.conditions.map((c) => ({
    attribute: c.attribute,
    operator: c.operator,
    value: c.value
  })),
  groups: g.groups.map(stripGroup)
});

describe("flattenTree", () => {
  it("encodes group paths with per-segment logic and skips incomplete conditions", () => {
    const b = block(
      "Application",
      group(
        "and",
        [cond("grc_environment", "eq", "Production"), cond("", "eq", "ignored")],
        [group("or", [cond("grc_criticality", "eq", "Tier 1")])]
      )
    );
    const rows = flattenTree([b]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceObjectType: "Application",
      attribute: "grc_environment",
      groupId: "0a",
      groupLogic: "and",
      name: "grc_environment equals Production"
    });
    expect(rows[1]).toMatchObject({
      attribute: "grc_criticality",
      groupId: "0a.0o",
      groupLogic: "or"
    });
    expect(rows[1].sequence).toBeGreaterThan(rows[0].sequence);
  });

  it("gives each type block its own root segment", () => {
    const rows = flattenTree([
      block("Application", group("and", [cond("grc_environment", "eq", "Production")])),
      block("Server", group("or", [cond("grc_os", "eq", "Windows")]))
    ]);
    expect(rows[0].groupId).toBe("0a");
    expect(rows[1].groupId).toBe("1o");
  });
});

describe("buildTree / round trip", () => {
  it("rebuilds the exact structure from flattened rows, including nesting and logic", () => {
    const original = [
      block(
        "Application",
        group(
          "and",
          [cond("grc_environment", "eq", "Production"), cond("grc_internetfacing", "eq", "1")],
          [
            group("or", [cond("grc_criticality", "eq", "Tier 1"), cond("grc_criticality", "eq", "Tier 2")]),
            group("and", [cond("grc_owner", "like", "team")])
          ]
        )
      ),
      block("Server", group("or", [cond("grc_os", "like", "Windows")]))
    ];
    const rebuilt = buildTree(flattenTree(original));
    expect(strip(rebuilt)).toEqual(strip(original));
  });

  it("keeps two blocks of the same object type separate", () => {
    const original = [
      block("Server", group("and", [cond("grc_os", "eq", "Windows")])),
      block("Server", group("and", [cond("grc_os", "eq", "Linux")]))
    ];
    const rebuilt = buildTree(flattenTree(original));
    expect(rebuilt).toHaveLength(2);
    expect(strip(rebuilt)).toEqual(strip(original));
  });

  it("carries Dataverse row ids through to the rebuilt conditions", () => {
    const rows = flattenTree([
      block("Server", group("and", [cond("grc_os", "eq", "Windows", "11111111-1111-1111-1111-111111111111")]))
    ]);
    expect(rows[0].id).toBe("11111111-1111-1111-1111-111111111111");
    const rebuilt = buildTree(rows);
    expect(rebuilt[0].root.conditions[0].criterionId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("tolerates rows with a foreign groupId format by putting them in the root group", () => {
    const rows: CriterionRow[] = [
      {
        id: "x",
        name: "manual row",
        sourceObjectType: "Server",
        attribute: "grc_os",
        operator: "eq",
        value: "Windows",
        groupId: "legacy-group-1",
        groupLogic: "or",
        sequence: 10
      }
    ];
    const rebuilt = buildTree(rows);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].root.logic).toBe("or");
    expect(rebuilt[0].root.conditions[0].attribute).toBe("grc_os");
  });
});
