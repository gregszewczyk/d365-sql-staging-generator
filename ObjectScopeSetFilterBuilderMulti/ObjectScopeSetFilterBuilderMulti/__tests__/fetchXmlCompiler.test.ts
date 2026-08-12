import {
  CompileOptions,
  compileCountFetchXml,
  compileFetchXml,
  compileFilterXml,
  escapeXml
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
const filter = (objectTypes: string[], root: GroupNode): ScopeSetFilter => ({ objectTypes, root });

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

describe("type pinning", () => {
  it("returns empty string when no object type is selected", () => {
    expect(compileFilterXml(filter([], group("and", [cond("grc_os", "eq", "x")])), opts)).toBe("");
  });

  it("uses eq for a single type, matching the original control's output", () => {
    expect(compileFilterXml(filter(["Server"], group("and", [])), opts)).toBe(
      `<filter type="and"><condition attribute="grc_objecttype" operator="eq" value="Server" /></filter>`
    );
  });

  it("uses in with <value> children for several types", () => {
    expect(compileFilterXml(filter(["Server", "Application"], group("and", [])), opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="in">` +
        `<value>Server</value><value>Application</value>` +
        `</condition>` +
        `</filter>`
    );
  });

  it("applies shared conditions once across all selected types", () => {
    const f = filter(
      ["Server", "Application"],
      group("and", [cond("grc_criticality", "eq", "Tier 1"), cond("grc_environment", "eq", "Production")])
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="in">` +
        `<value>Server</value><value>Application</value>` +
        `</condition>` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `<condition attribute="grc_environment" operator="eq" value="Production" />` +
        `</filter>`
    );
  });

  it("ignores blank entries in the type list", () => {
    expect(compileFilterXml(filter(["Server", "  "], group("and", [])), opts)).toBe(
      `<filter type="and"><condition attribute="grc_objecttype" operator="eq" value="Server" /></filter>`
    );
  });

  it("escapes type values", () => {
    expect(compileFilterXml(filter([`A&B`, "C"], group("and", [])), opts)).toContain(
      `<value>A&amp;B</value><value>C</value>`
    );
  });
});

describe("groups", () => {
  it("flattens an AND root into the pinning filter", () => {
    const f = filter(
      ["Application"],
      group(
        "and",
        [cond("grc_environment", "eq", "Production"), cond("grc_internetfacing", "eq", "1")],
        [group("or", [cond("grc_criticality", "eq", "Tier 1"), cond("grc_criticality", "eq", "Tier 2")])]
      )
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Application" />` +
        `<condition attribute="grc_environment" operator="eq" value="Production" />` +
        `<condition attribute="grc_internetfacing" operator="eq" value="1" />` +
        `<filter type="or">` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 2" />` +
        `</filter>` +
        `</filter>`
    );
  });

  it("nests an OR root inside the pinning filter so the type pin is never OR'd away", () => {
    const f = filter(
      ["Server", "Application"],
      group("or", [cond("grc_criticality", "eq", "Tier 1"), cond("grc_environment", "eq", "Production")])
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="in">` +
        `<value>Server</value><value>Application</value>` +
        `</condition>` +
        `<filter type="or">` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `<condition attribute="grc_environment" operator="eq" value="Production" />` +
        `</filter>` +
        `</filter>`
    );
  });

  it("supports arbitrary nesting depth", () => {
    const deep = group("and", [cond("grc_owner", "eq", "alice")]);
    const mid = group("or", [cond("grc_criticality", "eq", "Tier 1")], [deep]);
    const f = filter(["Application"], group("and", [cond("grc_environment", "eq", "Production")], [mid]));
    expect(compileFilterXml(f, opts)).toContain(
      `<filter type="or">` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `<filter type="and"><condition attribute="grc_owner" operator="eq" value="alice" /></filter>` +
        `</filter>`
    );
  });

  it("skips incomplete conditions and empty groups", () => {
    const f = filter(
      ["Server"],
      group(
        "and",
        [cond("", "eq", "x"), cond("grc_os", "eq", ""), cond("grc_os", "eq", "Windows")],
        [group("or", [cond("", "eq", "")])]
      )
    );
    expect(compileFilterXml(f, opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Server" />` +
        `<condition attribute="grc_os" operator="eq" value="Windows" />` +
        `</filter>`
    );
  });
});

describe("operators", () => {
  it("maps contains to like with wildcards", () => {
    expect(compileFilterXml(filter(["Server"], group("and", [cond("grc_os", "like", "Windows")])), opts)).toContain(
      `<condition attribute="grc_os" operator="like" value="%Windows%" />`
    );
  });

  it("expands in-operator values into <value> children", () => {
    const f = filter(["Application"], group("and", [cond("grc_environment", "in", "Production; Test;")]));
    expect(compileFilterXml(f, opts)).toContain(
      `<condition attribute="grc_environment" operator="in">` +
        `<value>Production</value><value>Test</value></condition>`
    );
  });

  it("escapes user values", () => {
    const f = filter(["Application"], group("and", [cond("grc_owner", "eq", `O'Brien & <co>`)]));
    expect(compileFilterXml(f, opts)).toContain(`value="O&apos;Brien &amp; &lt;co&gt;"`);
  });

  it("adds the active-only condition when configured", () => {
    const f = filter(["Server"], group("and", [cond("grc_os", "eq", "Windows")]));
    expect(compileFilterXml(f, { ...opts, activeAttribute: "grc_isactive" })).toContain(
      `<condition attribute="grc_isactive" operator="eq" value="1" />`
    );
  });
});

describe("compileFetchXml", () => {
  it("wraps the filter in a capped fetch with selected attributes and an order", () => {
    const f = filter(["Server"], group("and", [cond("grc_os", "eq", "Windows")]));
    expect(compileFetchXml(f, opts)).toBe(
      `<fetch top="50"><entity name="grc_jiraobject">` +
        `<attribute name="grc_name" /><attribute name="grc_objecttype" />` +
        `<order attribute="grc_name" />` +
        `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Server" />` +
        `<condition attribute="grc_os" operator="eq" value="Windows" />` +
        `</filter>` +
        `</entity></fetch>`
    );
  });

  it("returns empty string when there is nothing to query", () => {
    expect(compileFetchXml(filter([], group("and", [])), opts)).toBe("");
  });
});

describe("compileCountFetchXml", () => {
  it("builds an aggregate count query over the same filter", () => {
    const f = filter(["Server", "Application"], group("and", [cond("grc_criticality", "eq", "Tier 1")]));
    expect(compileCountFetchXml(f, opts)).toBe(
      `<fetch aggregate="true"><entity name="grc_jiraobject">` +
        `<attribute name="grc_jiraobjectid" alias="matchcount" aggregate="count" />` +
        `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="in">` +
        `<value>Server</value><value>Application</value>` +
        `</condition>` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `</filter>` +
        `</entity></fetch>`
    );
  });
});
