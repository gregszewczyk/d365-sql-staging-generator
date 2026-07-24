# PCF control brief — Object Scope Set filter builder

Drop this file into the project root as `BRIEF.md` so the agent has full context.

## What we're building

A PCF code component for a Dataverse model-driven app (GRC tool). It sits on the
**Object Scope Set** form and lets a user visually build a filter that selects
objects from a CMDB table, with a live preview of matching records.

It replaces a plain subgrid because the filter needs **nested AND/OR groups**
and **multiple source object types per set** — neither of which a standard
subgrid can express.

## Business context (why it exists)

The GRC tool documents risks and controls. A **Risk Statement** or **Control
Statement** needs to declare *which assets it applies to* — its scope. Rather
than hand-picking assets, users define a reusable **Object Scope Set**: a saved
filter like *"all internet-facing production applications, plus their Windows
production servers"*. Statements then reference that set.

Assets originate in Jira Assets (the client's CMDB) and are **synced nightly
into Dataverse**. The filter therefore runs against local Dataverse data — there
is no live Jira API call at preview time.

## Critical architecture decisions (already made — do not redesign)

1. **All CMDB objects live in ONE Dataverse table** with an object-type column
   and a superset of filterable attributes (nulls where an attribute doesn't
   apply to a type). This is deliberate: it makes multi-type filtering a single
   query. Do not assume one table per object type.
2. **The filter is dynamic**, not a frozen list. It re-evaluates against current
   data.
3. **Preview must not persist anything.** Running the filter shows matches;
   nothing is saved until the user explicitly saves the scope set.
4. **Criteria are stored as rows**, not as a JSON blob — so they remain
   queryable and reportable.

## Data model

Table and column names use the `grc_` publisher prefix. Confirm exact schema
names against the environment before coding — the names below are the design
intent, not verified logical names.

### grc_objectscopeset — the reusable filter definition
| Column | Type | Notes |
|---|---|---|
| grc_name | Text (primary) | Mandatory |
| grc_description | Multiline text | |
| grc_status | Choice | Draft / Active / Retired |
| grc_lastevaluatedon | DateTime | Set by the nightly job |
| grc_currentmatchcount | Whole number | Denormalised count |

Creator and created-on come from native `createdby` / `createdon`.

### grc_filtercriterion — child of scope set; one row per condition
| Column | Type | Notes |
|---|---|---|
| grc_name | Text (primary) | Derived label, e.g. "OS contains Windows" |
| grc_objectscopesetid | Lookup → scope set | Parental |
| grc_sourceobjecttype | Choice/Text | Which type-block this condition belongs to |
| grc_attribute | Choice/Text | The CMDB attribute being filtered |
| grc_operator | Choice | equals / not equals / contains / in / gt / lt |
| grc_value | Text | Comparison value |
| grc_groupid | Text or number | Which nested group this row belongs to |
| grc_grouplogic | Choice | AND / OR — how conditions in this group combine |
| grc_sequence | Whole number | Ordering |

**The grouping model is the crux of this component.** A scope set contains one
or more *type blocks* (each pinned to a source object type). Each type block
contains a root group plus optional nested groups. Conditions live in groups.
Groups combine with AND or OR; type blocks combine with OR.

If `grc_groupid` / `grc_grouplogic` prove insufficient for arbitrary nesting
depth, propose a revised shape before building — but keep criteria as rows.

### grc_jiraobject — the nightly-synced CMDB objects
| Column | Type | Notes |
|---|---|---|
| grc_name | Text (primary) | Display name from Jira |
| grc_jiraobjectkey | Text | Jira global ID. **Alternate key** — sync match key |
| grc_objecttype | Choice/Lookup | Application / Server / Service / etc. |
| *(filterable attributes)* | various | Only attributes actually filtered on — e.g. environment, criticality, OS, internet-facing, owner |
| grc_objecturl | URL | Deep link back to Jira |
| grc_lastsyncedon | DateTime | |
| grc_isactive | Yes/No | Flags retired objects |

## What the component must do

### 1. Filter builder UI
- Render one or more **type blocks**. Each pins a source object type and can be
  added/removed.
- Within a block: a root condition group, plus **nested groups**, each toggling
  AND / OR ("match ALL" / "match ANY").
- Each condition row: attribute picker, operator picker, value input, delete.
- Add condition / add nested group / add type block controls.
- **Attribute pickers must be scoped to the selected object type** — Server
  offers OS, Application offers internet-facing, etc. Do not offer every
  attribute for every type.
- Type blocks OR together; the UI should make that combining logic legible.

### 2. Preview
- A "Run filter" action that compiles the criteria tree into FetchXML, queries
  `grc_jiraobject` via `context.webAPI.retrieveMultipleRecords`, and renders
  matches with a total count.
- Page or cap results (top N with a "+ N more" indicator) — a filter can match
  thousands of rows.
- Show the object type per row; group by type or flat list (either is fine,
  flag which you chose).
- Preview is **ephemeral** — never write preview results to Dataverse.

### 3. Persistence
- Read existing criteria rows on load and rehydrate the builder.
- On save, write the criteria tree back as `grc_filtercriterion` rows
  (create/update/delete to match current UI state).
- Do not save on every keystroke; save is explicit.

## FetchXML patterns

Nested groups map onto nested `<filter>` elements. Single type block with a
nested OR group:

```xml
<fetch top="50">
  <entity name="grc_jiraobject">
    <attribute name="grc_name" />
    <attribute name="grc_objecttype" />
    <filter type="and">
      <condition attribute="grc_objecttype" operator="eq" value="Application" />
      <condition attribute="grc_environment" operator="eq" value="Production" />
      <condition attribute="grc_internetfacing" operator="eq" value="1" />
      <filter type="or">
        <condition attribute="grc_criticality" operator="eq" value="Tier 1" />
        <condition attribute="grc_criticality" operator="eq" value="Tier 2" />
      </filter>
    </filter>
  </entity>
</fetch>
```

Multiple type blocks — each block becomes an AND group, all OR'd together:

```xml
<filter type="or">
  <filter type="and">
    <condition attribute="grc_objecttype" operator="eq" value="Application" />
    <condition attribute="grc_environment" operator="eq" value="Production" />
  </filter>
  <filter type="and">
    <condition attribute="grc_objecttype" operator="eq" value="Server" />
    <condition attribute="grc_os" operator="like" value="%Windows%" />
  </filter>
</filter>
```

The FetchXML compiler is the piece most worth unit-testing in isolation —
criteria tree in, XML out, no Dataverse dependency.

## Technical setup

- Scaffold with Power Platform CLI: `pac pcf init`
- **React virtual control** (not the standard control type) — the nested group
  UI needs real component state
- TypeScript
- Package into a solution for import; `pac auth create` against the dev
  environment is handled by the developer, not the agent
- Target environment for testing: a Dataverse dev environment with the tables above

## UI reference

A mockup was produced showing the intended layout: stacked type-block cards
(each with a coloured left border and a type pill), criteria groups as bordered
panels with an AND/OR segmented toggle, condition rows as a 4-column grid
(attribute / operator / value / delete), dashed-border nested groups, an "add
another source object type" dashed full-width button, and a preview card at the
bottom with a match-count pill and a per-row type label.

Match the model-driven app's native look rather than introducing a separate
design language — this control sits inside a standard form.

## Out of scope for this component

- The nightly Jira → Dataverse sync (separate pipeline)
- The nightly re-evaluation and change-notification job (Power Automate or a
  plug-in, separate work)
- Applying a scope set to a Risk/Control Statement (a separate junction table
  and subgrid)
- Any snapshot/approval workflow

## Open questions to resolve before or during build

1. **Exact logical names** for every table and column — verify against the
   environment; the names here are design intent.
2. **Attribute metadata source** — should the attribute picker read table
   metadata at runtime, or be driven by a config table mapping object types to
   their valid attributes? Recommend one.
3. **Nesting depth** — is one level of nested group enough, or is arbitrary
   depth required? Affects the grouping model.
4. **Multi-value operators** — how should `in` store multiple values in a single
   `grc_value` text column? Delimited, or a child table?
5. **Preview paging** — top-N with a count, or real paging with a cookie?
6. **Are PCF code components permitted** in the target environment? Managed
   environments can block custom code components. If blocked, this becomes a
   Custom Page instead. **Confirm before investing build time.**

## Suggested build order

1. Scaffold the PCF project and get an empty React control rendering on the form
2. Build the criteria tree data structure and the FetchXML compiler, with unit
   tests — no UI, no Dataverse
3. Build the filter-builder UI against in-memory state
4. Wire the preview to `context.webAPI`
5. Wire load/save against `grc_filtercriterion`
6. Style to match the model-driven form
