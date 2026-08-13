import {
  CompileOptions,
  compileCountFetchXml,
  compileFetchXml,
  compileFilterXml,
  escapeXml,
  hasTypeCondition
} from "../model/fetchXmlCompiler";
import { ConditionNode, GroupNode, Operator, ScopeSetFilter } from "../model/types";

let n = 0;
const cond = (attribute: string, operator: Operator, value: string): ConditionNode => ({
  id: `c${++n}`,
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

const opts: CompileOptions = {
  entityName: "grc_jiraobject",
  typeAttribute: "grc_objecttype",
  selectAttributes: ["grc_name", "grc_objecttype"],
  top: 50
};

describe("escapeXml", () => {
  it("escapes all five XML special characters", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });
});

describe("object type as an ordinary condition", () => {
  // The requirement that drove this design, verbatim from the customer:
  //   (Type = Office AND Location = Germany) OR (Type = Product)
  it("expresses (Type = Office AND Location = Germany) OR (Type = Product)", () => {
    const f = filter(
      group(
        "or",
        [cond("grc_objecttype", "eq", "Product")],
        [group("and", [cond("grc_objecttype", "eq", "Office"), cond("grc_location", "eq", "Germany")])]
      )
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="or">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Product" />` +
        `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Office" />` +
        `<condition attribute="grc_location" operator="eq" value="Germany" />` +
        `</filter>` +
        `</filter>`
    );
  });

  it("still expresses the old per-type-block design (OR of AND groups)", () => {
    const f = filter(
      group(
        "or",
        [],
        [
          group("and", [cond("grc_objecttype", "eq", "Application"), cond("grc_environment", "eq", "Production")]),
          group("and", [cond("grc_objecttype", "eq", "Server"), cond("grc_os", "like", "Windows")])
        ]
      )
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="or">` +
        `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Application" />` +
        `<condition attribute="grc_environment" operator="eq" value="Production" />` +
        `</filter>` +
        `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Server" />` +
        `<condition attribute="grc_os" operator="like" value="%Windows%" />` +
        `</filter>` +
        `</filter>`
    );
  });

  it("still expresses the old shared-type-list design (type in, shared conditions)", () => {
    const f = filter(
      group("and", [
        cond("grc_objecttype", "in", "Server;Application"),
        cond("grc_criticality", "eq", "Tier 1")
      ])
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="in">` +
        `<value>Server</value><value>Application</value>` +
        `</condition>` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `</filter>`
    );
  });

  it("gives the type column no special treatment in the XML", () => {
    const typed = filter(group("and", [cond("grc_objecttype", "eq", "Office")]));
    const other = filter(group("and", [cond("grc_location", "eq", "Office")]));
    expect(compileFilterXml(typed, opts).replace("grc_objecttype", "grc_location")).toBe(
      compileFilterXml(other, opts)
    );
  });
});

describe("hasTypeCondition", () => {
  it("finds a type condition at any depth", () => {
    const nested = filter(group("and", [], [group("or", [cond("grc_objecttype", "eq", "Office")])]));
    expect(hasTypeCondition(nested, "grc_objecttype")).toBe(true);
  });

  it("is false when the tree never constrains type", () => {
    expect(hasTypeCondition(filter(group("and", [cond("grc_location", "eq", "DE")])), "grc_objecttype")).toBe(false);
  });

  it("ignores an incomplete type condition", () => {
    expect(hasTypeCondition(filter(group("and", [cond("grc_objecttype", "eq", "")])), "grc_objecttype")).toBe(false);
  });
});

describe("groups", () => {
  it("returns empty string when nothing usable is present, rather than an unbounded fetch", () => {
    expect(compileFilterXml(filter(group("and", [])), opts)).toBe("");
    expect(compileFilterXml(filter(group("and", [cond("grc_os", "eq", "")])), opts)).toBe("");
    expect(compileFetchXml(filter(group("and", [])), opts)).toBe("");
  });

  it("supports arbitrary nesting depth", () => {
    const deep = group("and", [cond("grc_owner", "eq", "alice")]);
    const mid = group("or", [cond("grc_criticality", "eq", "Tier 1")], [deep]);
    const f = filter(group("and", [cond("grc_objecttype", "eq", "Application")], [mid]));
    expect(compileFilterXml(f, opts)).toContain(
      `<filter type="or">` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `<filter type="and"><condition attribute="grc_owner" operator="eq" value="alice" /></filter>` +
        `</filter>`
    );
  });

  it("skips incomplete conditions and empty groups", () => {
    const f = filter(
      group(
        "and",
        [cond("", "eq", "x"), cond("grc_os", "eq", ""), cond("grc_os", "eq", "Windows")],
        [group("or", [cond("", "eq", "")])]
      )
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="and"><condition attribute="grc_os" operator="eq" value="Windows" /></filter>`
    );
  });
});

describe("active-objects condition", () => {
  it("is absorbed into an AND root", () => {
    const f = filter(group("and", [cond("grc_os", "eq", "Windows")]));
    expect(compileFilterXml(f, { ...opts, activeAttribute: "grc_isactive" })).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_isactive" operator="eq" value="1" />` +
        `<condition attribute="grc_os" operator="eq" value="Windows" />` +
        `</filter>`
    );
  });

  it("wraps an OR root so it cannot become an alternative to the active check", () => {
    const f = filter(group("or", [cond("grc_objecttype", "eq", "Office"), cond("grc_objecttype", "eq", "Product")]));
    expect(compileFilterXml(f, { ...opts, activeAttribute: "grc_isactive" })).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_isactive" operator="eq" value="1" />` +
        `<filter type="or">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Office" />` +
        `<condition attribute="grc_objecttype" operator="eq" value="Product" />` +
        `</filter>` +
        `</filter>`
    );
  });
});

describe("operators", () => {
  it("maps contains to like with wildcards", () => {
    expect(compileFilterXml(filter(group("and", [cond("grc_os", "like", "Windows")])), opts)).toContain(
      `<condition attribute="grc_os" operator="like" value="%Windows%" />`
    );
  });

  it("expands in-operator values into <value> children", () => {
    expect(compileFilterXml(filter(group("and", [cond("grc_environment", "in", "Production; Test;")])), opts)).toContain(
      `<condition attribute="grc_environment" operator="in">` +
        `<value>Production</value><value>Test</value></condition>`
    );
  });

  it("escapes user values", () => {
    expect(compileFilterXml(filter(group("and", [cond("grc_owner", "eq", `O'Brien & <co>`)])), opts)).toContain(
      `value="O&apos;Brien &amp; &lt;co&gt;"`
    );
  });
});

describe("compileFetchXml", () => {
  it("wraps the filter in a capped fetch with selected attributes and an order", () => {
    const f = filter(group("and", [cond("grc_objecttype", "eq", "Server")]));
    expect(compileFetchXml(f, opts)).toBe(
      `<fetch top="50"><entity name="grc_jiraobject">` +
        `<attribute name="grc_name" /><attribute name="grc_objecttype" />` +
        `<order attribute="grc_name" />` +
        `<filter type="and"><condition attribute="grc_objecttype" operator="eq" value="Server" /></filter>` +
        `</entity></fetch>`
    );
  });
});

describe("compileCountFetchXml", () => {
  it("builds an aggregate count query over the same filter", () => {
    const f = filter(group("and", [cond("grc_objecttype", "eq", "Server")]));
    expect(compileCountFetchXml(f, opts)).toBe(
      `<fetch aggregate="true"><entity name="grc_jiraobject">` +
        `<attribute name="grc_jiraobjectid" alias="matchcount" aggregate="count" />` +
        `<filter type="and"><condition attribute="grc_objecttype" operator="eq" value="Server" /></filter>` +
        `</entity></fetch>`
    );
  });
});
