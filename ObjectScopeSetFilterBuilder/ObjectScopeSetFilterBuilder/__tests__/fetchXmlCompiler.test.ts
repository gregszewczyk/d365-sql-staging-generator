import {
  CompileOptions,
  compileCountFetchXml,
  compileFetchXml,
  compileFilterXml,
  escapeXml
} from "../model/fetchXmlCompiler";
import { ConditionNode, GroupNode, Operator, TypeBlockNode } from "../model/types";

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
const block = (objectType: string, root: GroupNode): TypeBlockNode => ({ id: `b${++n}`, objectType, root });

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

describe("compileFilterXml", () => {
  it("returns empty string when no block has an object type", () => {
    expect(compileFilterXml([block("", group("and", [cond("grc_os", "eq", "x")]))], opts)).toBe("");
    expect(compileFilterXml([], opts)).toBe("");
  });

  it("pins the object type even when a block has no conditions yet", () => {
    expect(compileFilterXml([block("Server", group("and", []))], opts)).toBe(
      `<filter type="and"><condition attribute="grc_objecttype" operator="eq" value="Server" /></filter>`
    );
  });

  it("flattens an AND root group into the pinning filter (brief example 1)", () => {
    const b = block(
      "Application",
      group(
        "and",
        [cond("grc_environment", "eq", "Production"), cond("grc_internetfacing", "eq", "1")],
        [group("or", [cond("grc_criticality", "eq", "Tier 1"), cond("grc_criticality", "eq", "Tier 2")])]
      )
    );
    expect(compileFilterXml([b], opts)).toBe(
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

  it("nests an OR root group inside the type-pinning AND filter", () => {
    const b = block("Server", group("or", [cond("grc_os", "eq", "Windows"), cond("grc_os", "eq", "Linux")]));
    expect(compileFilterXml([b], opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Server" />` +
        `<filter type="or">` +
        `<condition attribute="grc_os" operator="eq" value="Windows" />` +
        `<condition attribute="grc_os" operator="eq" value="Linux" />` +
        `</filter>` +
        `</filter>`
    );
  });

  it("ORs multiple type blocks together (brief example 2)", () => {
    const blocks = [
      block("Application", group("and", [cond("grc_environment", "eq", "Production")])),
      block("Server", group("and", [cond("grc_os", "like", "Windows")]))
    ];
    expect(compileFilterXml(blocks, opts)).toBe(
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

  it("supports arbitrary nesting depth", () => {
    const deep = group("and", [cond("grc_owner", "eq", "alice")]);
    const mid = group("or", [cond("grc_criticality", "eq", "Tier 1")], [deep]);
    const b = block("Application", group("and", [cond("grc_environment", "eq", "Production")], [mid]));
    expect(compileFilterXml([b], opts)).toContain(
      `<filter type="or">` +
        `<condition attribute="grc_criticality" operator="eq" value="Tier 1" />` +
        `<filter type="and"><condition attribute="grc_owner" operator="eq" value="alice" /></filter>` +
        `</filter>`
    );
  });

  it("maps contains to like with wildcards", () => {
    const b = block("Server", group("and", [cond("grc_os", "like", "Windows")]));
    expect(compileFilterXml([b], opts)).toContain(
      `<condition attribute="grc_os" operator="like" value="%Windows%" />`
    );
  });

  it("expands in-operator values into <value> children", () => {
    const b = block("Application", group("and", [cond("grc_environment", "in", "Production; Test;")]));
    expect(compileFilterXml([b], opts)).toContain(
      `<condition attribute="grc_environment" operator="in">` +
        `<value>Production</value><value>Test</value></condition>`
    );
  });

  it("skips incomplete conditions and empty groups", () => {
    const b = block(
      "Server",
      group(
        "and",
        [cond("", "eq", "x"), cond("grc_os", "eq", ""), cond("grc_os", "eq", "Windows")],
        [group("or", [cond("", "eq", "")])]
      )
    );
    expect(compileFilterXml([b], opts)).toBe(
      `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Server" />` +
        `<condition attribute="grc_os" operator="eq" value="Windows" />` +
        `</filter>`
    );
  });

  it("escapes user values in XML", () => {
    const b = block("Application", group("and", [cond("grc_owner", "eq", `O'Brien & <co>`)]));
    expect(compileFilterXml([b], opts)).toContain(`value="O&apos;Brien &amp; &lt;co&gt;"`);
  });

  it("adds the active-only condition when configured", () => {
    const b = block("Server", group("and", [cond("grc_os", "eq", "Windows")]));
    expect(compileFilterXml([b], { ...opts, activeAttribute: "grc_isactive" })).toContain(
      `<condition attribute="grc_isactive" operator="eq" value="1" />`
    );
  });
});

describe("compileFetchXml", () => {
  it("wraps the filter in a capped fetch with selected attributes and an order", () => {
    const b = block("Server", group("and", [cond("grc_os", "eq", "Windows")]));
    expect(compileFetchXml([b], opts)).toBe(
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
    expect(compileFetchXml([], opts)).toBe("");
  });
});

describe("compileCountFetchXml", () => {
  it("builds an aggregate count query over the same filter", () => {
    const b = block("Server", group("and", [cond("grc_os", "eq", "Windows")]));
    expect(compileCountFetchXml([b], opts)).toBe(
      `<fetch aggregate="true"><entity name="grc_jiraobject">` +
        `<attribute name="grc_jiraobjectid" alias="matchcount" aggregate="count" />` +
        `<filter type="and">` +
        `<condition attribute="grc_objecttype" operator="eq" value="Server" />` +
        `<condition attribute="grc_os" operator="eq" value="Windows" />` +
        `</filter>` +
        `</entity></fetch>`
    );
  });
});
