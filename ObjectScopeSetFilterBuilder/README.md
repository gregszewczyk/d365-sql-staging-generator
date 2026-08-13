# Object Scope Set Filter Builder (PCF)

A React **virtual** PCF control for the Object Scope Set form in the GRC
model-driven app. It lets users visually build a nested AND/OR filter over the
CMDB table (`grc_jiraobject`), preview matching objects live, and persist the
criteria as `grc_filtercriterion` rows. See `BRIEF.md` / the project brief for
the business context.

> **Note:** this is the original design, where each type block pins one object
> type. A parallel variant in `../ObjectScopeSetFilterBuilderMulti/` treats
> object type as an ordinary condition, freely combinable with AND/OR — it is a
> strict superset of this design and is where the customer's requirements have
> landed. Both are installed as separate components
> (`GRC.ObjectScopeSetFilterBuilderMulti`) so they can be compared on the form.
> **Keep this project frozen** — changes belong in the variant.

## Layout

```
ObjectScopeSetFilterBuilder/
├── ControlManifest.Input.xml     virtual control, WebAPI feature, 3 properties
├── index.ts                      PCF entry point (ReactControl)
├── components/                   builder UI (type blocks, groups, conditions, preview)
├── model/
│   ├── types.ts                  criteria tree + operator/attribute typing
│   ├── config.ts                 all Dataverse names + attribute catalogue (overridable)
│   ├── fetchXmlCompiler.ts       criteria tree -> FetchXML (pure, unit-tested)
│   ├── persistence.ts            tree <-> grc_filtercriterion rows + WebAPI I/O
│   └── treeUtils.ts              immutable tree edit helpers
├── css/                          styling matched to model-driven forms
└── __tests__/                    Jest tests for the compiler and persistence
```

## Build & test

```bash
npm install
npm run build     # pcf-scripts build (manifest validation + lint + bundle)
npm test          # 21 Jest tests: FetchXML compiler + persistence round-trip
npm start         # PCF test harness (limited: no WebAPI there)
```

## Packaging into a solution (developer steps, needs pac CLI)

```bash
pac auth create --url https://<yourorg>.crm.dynamics.com
mkdir solution && cd solution
pac solution init --publisher-name grc --publisher-prefix grc
pac solution add-reference --path ..
dotnet build   # or: msbuild /t:build /restore
```

The solution's unique name comes from the folder `pac solution init` runs in
(there is no `--solution-name` argument), so the above yields a solution called
`solution`. If the multi-type variant also inits in a folder called `solution`,
the second import updates this one and both controls end up in it — they still
work, since components are identified by `namespace.constructor`, but neither
can then be promoted without the other. See
`../ObjectScopeSetFilterBuilderMulti/README.md`.

Import the resulting zip, then add the control to the **grc_objectscopeset**
main form: bind it to any text column (e.g. `grc_description` or a dedicated
placeholder column — the control never writes to it) and stretch it across the
form. Ensure "Allow publishing of canvas apps with code components" / PCF is
enabled in the target (managed) environment first — brief open question 6.

## Configuration

The manifest exposes three properties:

| Property | Purpose |
|---|---|
| `boundField` | Anchor only. Any SingleLine.Text column; never written. |
| `configJson` | Optional JSON overriding every Dataverse name and the attribute catalogue. |
| `previewTop` | Preview row cap (default 50). |

Because the brief's logical names are design intent, **every** table/column
name lives in `model/config.ts` and can be overridden without a code change:

```json
{
  "jiraObjectEntity": "grc_jiraobject",
  "typeAttribute": "grc_objecttype",
  "activeAttribute": "grc_isactive",
  "criterionEntity": "grc_filtercriterion",
  "criterionColumns": { "scopeSetNav": "grc_ObjectScopeSetId", "scopeSetEntitySet": "grc_objectscopesets" },
  "choiceMaps": { "operator": { "eq": 100000000, "ne": 100000001 } },
  "objectTypes": [
    {
      "value": "Application", "label": "Application",
      "attributes": [
        { "logicalName": "grc_internetfacing", "label": "Internet-facing", "kind": "boolean" },
        { "logicalName": "grc_environment", "label": "Environment", "kind": "choice",
          "options": [ { "value": "Production", "label": "Production" } ] }
      ]
    }
  ]
}
```

`choiceMaps` handles environments where `grc_operator` / `grc_grouplogic` /
`grc_sourceobjecttype` are Choice columns: map builder strings to option
values and the control writes numbers and reverse-maps on load. Without a map
it writes strings (Text columns).

## Design decisions (answers to the brief's open questions)

1. **Logical names** — centralised in `config.ts`, overridable per environment
   via `configJson`. Verify `scopeSetNav` (lookup schema name, case-sensitive)
   and `scopeSetEntitySet` against the real environment before first save.
2. **Attribute metadata source** — config-driven, not runtime metadata.
   Runtime `EntityMetadata` can list columns but cannot know which belong to
   which object type (single-table design), so a type→attributes catalogue is
   needed anyway. Recommendation: keep the catalogue in `configJson` for now;
   if admins need to edit it without a form-designer visit, promote it to a
   config table later and inject its content the same way.
3. **Nesting depth** — arbitrary depth supported. `grc_groupid` stores a
   dot-separated path of `<index><logic>` segments (`"0a.1o"` = root AND
   group of block 0 → its second nested group, OR). `grc_grouplogic` still
   stores the containing group's logic redundantly so rows stay reportable.
   Rows with unrecognised `grc_groupid` values load into the block's root
   group instead of failing.
4. **Multi-value `in`** — delimited within `grc_value` using `;`. A child
   table would be over-engineering for values that are only ever compiled
   into FetchXML `<value>` elements. The delimiter is a single constant
   (`IN_DELIMITER` in `types.ts`).
5. **Preview paging** — top-N (default 50) plus a separate aggregate-count
   query for the true total, shown as "N matches / + N more". Real paging
   cookies add little for a sanity-check preview; the aggregate degrades
   gracefully (falls back to row count if the 50k aggregate limit is hit).
6. **PCF permitted?** — must still be confirmed in the target managed
   environment before investing further; the model layer (compiler,
   persistence mapping) is UI-framework-independent and would survive a move
   to a Custom Page.

Other choices worth knowing:

- **Preview list is flat** with a per-row type label (the brief allowed flat
  or grouped). Rows deep-link to Jira via `grc_objecturl` when present.
- **Preview always adds `grc_isactive eq 1`** per block (disable by setting
  `activeAttribute: null` in config) so retired objects don't inflate counts.
- **Root AND groups flatten** into the type-pinning `<filter type="and">`,
  matching the brief's example XML exactly; OR roots nest inside it.
- **Save is explicit** and diff-based: rows still present are updated, new
  ones created, removed ones deleted; the builder reloads after save so new
  rows carry their Dataverse ids. Preview never writes anything.
- **Unsaved parent record**: the builder works but Save is disabled with a
  hint until the scope set record exists (record id comes from
  `context.mode.contextInfo`).
