# configJson examples

| File | For |
|---|---|
| `current-schema.json` | **Use this now.** The `grc_jiraobject` table as it actually exists — the brief's original schema |
| `loox-cmdb.json` | Aspirational. Derived from a LooX export whose columns are not in the environment yet |

## current-schema.json

Matches the deployed table: `grc_name`, `grc_jiraobjectkey`, `grc_objecttype`,
`grc_criticality`, `grc_environment`, `grc_internetfacing`, `grc_os`,
`grc_owner`, `grc_isactive`, `grc_objecturl`, `grc_lastsyncedon`. Logical names
are the lowercase form of the schema names the maker portal shows
(`grc_Criticality` → `grc_criticality`); FetchXML and the Web API want the
lowercase form.

Per-type catalogues follow the brief's intent: Internet Facing only on
Application, OS only on Server, and Name / Jira Object Key / Environment /
Criticality / Owner / Last Synced On shared by all three.

Two things to verify, since column *types* are not visible in the column list:

**Are `grc_objecttype`, `grc_criticality` and `grc_environment` Choice or Text?**

```
/api/data/v9.2/EntityDefinitions(LogicalName='grc_jiraobject')/Attributes?$select=LogicalName,AttributeType
```

`String` → the config is correct as written. `Picklist` → every `value` for that
attribute must become the numeric option value as a string, and so must the
`value` on each object type. Get them with:

```
/api/data/v9.2/EntityDefinitions(LogicalName='grc_jiraobject')/Attributes(LogicalName='grc_objecttype')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)
```

Note `kind` is a **UI** hint, not the storage type: `choice` renders a dropdown
and stores whatever string you list, which is right for a Text column holding a
fixed vocabulary. The two only have to agree on the *value*.

**Do the type values match the data?**

```
/api/data/v9.2/grc_jiraobjects?$apply=groupby((grc_objecttype),aggregate($count as count))
```

If the rows say something other than Application / Server / Service, change the
three `value` fields to match — a mismatch here is the classic "0 matches with
data present".

### On `grc_isactive`

`activeAttribute` is set, so **every** query silently gains
`grc_isactive eq 1` and retired objects never appear. That is usually right for
GRC scoping. If someone needs to filter *for* retired objects, set
`activeAttribute` to `null` and add
`{ "logicalName": "grc_isactive", "label": "Is Active", "kind": "boolean" }`
to each type instead, making it an explicit choice rather than an invisible one.

### Not in the catalogue

`grc_jiraobjectid` is the table's primary key, not a filterable attribute.
`grc_objecturl` is consumed as the preview's deep link rather than offered as a
filter.


## loox-cmdb.json

Derived from a real LooX export of 1,125 CMDB rows. **Not usable yet** — none of
these columns exist in the environment. Keep it as the target shape for when the
sync brings them across.

## What the export showed

Object type lives in **System type**, with three values:

| Value | Rows |
|---|---|
| Stand Alone | 717 |
| *(blank)* | 225 |
| Plugin/App | 151 |
| Infrastructure | 32 |

**225 rows have no System type at all.** They can never match a type condition,
so they are invisible to any filter that constrains type. Worth fixing in the
sync, or accepting knowingly.

The three types share nearly every attribute — the export shows similar fill
rates across all of them — so the per-type catalogues here are almost identical.
The only genuine differences:

- **Parent App** — 28% of Plugin/App, 5% of Stand Alone, 0% of Infrastructure
- **Total / Active Licenses** — only ever populated on Infrastructure rows
- **Internal order number** — 20% of Plugin/App vs 2–3% elsewhere

## Every name the preview touches must be set explicitly

The preview query selects the primary name, the type column and the deep-link
column on **every** run, so a wrong or non-existent name there fails the whole
preview with *"The specified field does not exist in Microsoft Dynamics 365"* —
even when the condition you typed is perfectly valid. The error names no column,
so it is easy to misread as a problem with the condition.

This export has no Jira deep-link column, hence `"objectUrlAttribute": null`,
which drops it from the query. Point it at Login Link or Link to Documentation
instead if clickable preview rows are wanted. `activeAttribute` is `null` for
the same reason — no active/retired flag exists in the export.

## Two things to fix before this config is right

**1. Logical names are assumed.** The export carries Jira display names, not
Dataverse logical names. The names here follow the obvious convention
(`System type` → `grc_systemtype`). Verify against the environment and correct
any that differ:

```
/api/data/v9.2/EntityDefinitions(LogicalName='grc_jiraobject')/Attributes?$select=LogicalName,AttributeType
```

**2. Status values are raw Jira IDs.** The column holds `16`, `15`, `20`, `14`,
`6`, `21` — not labels. The placeholder labels here (`Status 16 (604 rows)`)
exist only so the picker is usable while you find out what they mean. Replace
them with the real status names from Jira.

## Attribute notes

- **Access type** and **Where get access** carry real labels, so they are proper
  `choice` attributes — the most immediately useful filters in the set.
- **Reference columns** (Application Environment, Vendor, Manufacturer, Supplier,
  Responsible, Accountable, Accountable Unit, Invoice cost center, Parent App,
  Application, License, Internal order number) hold opaque Jira keys such as
  `CD-119428` and `AUSO-31150`, not names. They are typed as `text` and are
  filterable, but a user must know the key. Resolving these to display names is
  a sync-pipeline job, not something the control can do.
- **Contract** is multi-valued using a `||` separator (`AUSO-103130||AUSO-7069128`).
  Use the **contains** operator on it; `equals` only matches single-contract rows.
- **Cost per year** is a formatted string (`95,000.00 €`, and `-` for unknown),
  so it is typed `text`. It cannot be compared numerically until the sync stores
  a real number.
- **Displayed in App Store** and **Need approve** are typed `boolean`, which
  assumes Yes/No columns in Dataverse. If they are text (`True`/`False`), change
  `kind` to `choice` with those two options.
- `activeAttribute` is set to `null` because the export has no active/retired
  flag. Set it to your Yes/No column if one exists, or retired rows will inflate
  every count. Note that names ending "RETIRED" appear in the data.

## Columns deliberately left out

- **Always empty:** Element category, RTO, RPO, Confidentiality, Integrity,
  Availability, Authenticity, AI classification. Add them once the sync
  populates them — the CIA triad columns in particular look valuable for GRC
  scoping.
- **Single-valued, so useless as filters:** Element Type (always `CD-412`),
  Service Type and Sub-type (always `CD-1040`), Source (always `LooX`).
- **Identifiers and links:** Key, Link to Documentation, Login Link, Access
  Request Link, Access Request (Other). Add them if "has documentation" style
  filters turn out to be wanted.
