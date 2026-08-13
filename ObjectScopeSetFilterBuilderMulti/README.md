# Object Scope Set Filter Builder — flexible variant

A **separate PCF component** (`GRC.ObjectScopeSetFilterBuilderMulti`) that can be
installed alongside the original `GRC.ObjectScopeSetFilterBuilder` in the same
environment, so both designs can be demoed and swapped on the form while the
customer decides which they want.

**Current state:** object type is an ordinary condition. The two components are
functionally different — this one shows a single criteria tree in which type is
just another attribute, where the original shows stacked per-type blocks.

## What this variant does differently

There is no type selector. `grc_objecttype` appears in the attribute picker
alongside Location, Criticality and the rest, so it combines freely with AND/OR
and nested groups. That makes filters like this expressible, which neither
earlier design could manage:

> (Type = Office AND Location = Germany) OR (Type = Product)

```xml
<filter type="or">
  <condition attribute="grc_objecttype" operator="eq" value="Product" />
  <filter type="and">
    <condition attribute="grc_objecttype" operator="eq" value="Office" />
    <condition attribute="grc_location" operator="eq" value="Germany" />
  </filter>
</filter>
```

This **supersedes both earlier designs** rather than adding to them:

| Earlier design | Expressed here as |
|---|---|
| Per-type blocks (original control) | an OR of AND groups, each containing its own type condition |
| One shared type list | a single `Type in (...)` condition near the root |

### Attribute scoping without a type selector

The brief's rule — don't offer every attribute for every type — still holds, but
with no global type list there is nothing obvious to scope by. The picker
therefore **infers the type context** from the condition's position in the tree:
walking the AND groups from the root down, any type condition found constrains
its siblings, because within an AND group `Type = Office` means every sibling
condition applies only to Offices. OR groups contribute nothing, since their
members are alternatives rather than constraints.

- **Constrained context** → the intersection of those types' attributes. Inside
  a `Type = Office AND …` branch you get Office's attributes only.
- **Unconstrained context** → the union, since no type is known yet.
- **Contradictory context** (e.g. `Type = Server AND Type = Application`) → only
  the type attribute, and the group says no object type can satisfy it.

Each group shows which types its attributes apply to, so the inference is
visible rather than magic. Conditions whose attribute doesn't apply to every
type in context are flagged amber and kept, never deleted — a condition never
matches a null, so such a filter silently excludes those objects, and saying so
is better than hiding it.

### No type condition at all

A tree with no type condition matches every object type. That is legitimate, so
it is allowed, but the control says so explicitly rather than quietly returning
the whole CMDB.

## Why a separate component rather than a second solution of the same control

PCF components are identified by `namespace.constructor`, not by which solution
carries them. Importing the same `namespace.constructor` from a second solution
does not produce a copy — it relocates/overwrites the first and leaves messy
solution layering. Everything that carries the component identity therefore
differs here:

| | Original | This variant |
|---|---|---|
| Constructor | `ObjectScopeSetFilterBuilder` | `ObjectScopeSetFilterBuilderMulti` |
| Display name | Object Scope Set Filter Builder | Object Scope Set Filter Builder (flexible) |
| Exported class | `ObjectScopeSetFilterBuilder` | `ObjectScopeSetFilterBuilderMulti` |
| CSS file | `ObjectScopeSetFilterBuilder.css` | `ObjectScopeSetFilterBuilderMulti.css` |
| CSS class prefix | `ossfb-` | `ossfbm-` |
| `.pcfproj` ProjectGuid | `abaf2312-…` | `9a010376-…` |

The CSS prefix is renamed because both stylesheets load globally when both
controls sit on the same form — shared class names would let one control's
styling override the other's once the two diverge.

Namespace stays `GRC` and the publisher prefix stays `grc`; neither
participates in the collision.

## Build

```bash
npm install
npm run build     # ends with "[build] Succeeded"
npm test          # 57 tests
```

## Package into a solution

The solution folder is **not committed** — it is local build scaffolding that
`pac solution init` generates, so a fresh clone or zip download will not have
one. Create it once per working copy; it is then reusable, and source changes
only need `npm run build` + `dotnet build`.

```bash
# from this folder
mkdir solution && cd solution
pac solution init --publisher-name grc --publisher-prefix grc
pac solution add-reference --path ..
dotnet build
```

Note there is **no `--solution-name` argument**: `pac solution init` takes the
solution's unique name from the folder it runs in. Unique names must be
alphanumeric — no hyphens or spaces.

### Sharing a solution name with the original control

Using `solution` for both projects means the second import *updates* the first
solution, so both controls end up inside it. **Both still work** — components
are identified by `namespace.constructor`, not by their solution — so this is
fine while the two designs are being compared. The only cost is that neither
control can then be promoted to test/prod without the other.

To separate them later, init in a distinctly named folder (e.g.
`SolutionMulti`), or edit `<UniqueName>` and `<LocalizedName>` in
`solution/src/Other/Solution.xml` and rebuild. Check what is currently deployed
with:

```
/api/data/v9.2/solutions?$select=uniquename,friendlyname,version&$filter=ismanaged eq false
```

Import `solution/bin/Debug/solution.zip` through make.powerapps.com. Both
components then appear under **Get more components** on the scope set form, and
you switch designs by changing which one is bound to the anchor column — or bind
each to its own anchor column to show them side by side.

Configuration (`configJson`, `previewTop`) is per-component-instance on the
form, so **both controls need their own copy** of the config. For this
environment that is:

```json
{
  "criterionColumns": {
    "scopeSetLookup": "grc_objectscopesetid",
    "scopeSetNav": "grc_ObjectScopeSetID",
    "scopeSetEntitySet": "grc_objectscopesets"
  }
}
```

## Behaviour decisions

| Decision | Choice | Why |
|---|---|---|
| Object type | An ordinary condition, no special casing | Lets type participate in AND/OR like any attribute; supersedes both earlier designs |
| Attribute picker scoping | Inferred from enclosing AND context | Keeps the brief's guardrail without a global type list; sound because an AND-context type condition genuinely constrains its siblings |
| Attribute outside context | Kept and flagged amber | Non-destructive, and names the types that will not match |
| Untyped filter | Allowed, with a visible warning | Matching all types is a valid intent, but never a silent default |
| `grc_sourceobjecttype` | Denormalised: distinct types the tree references, stamped on every row | Existing "which scope sets touch Servers?" reporting keeps working without parsing the tree |

Only positive (`eq` / `in`) type conditions feed the denormalised column: a
`Type != Office` condition says nothing about which types a set covers, so
counting it would make the column misleading.

The column must be **Text** once a tree references more than one type, since a
delimited list cannot be stored in a Choice column.

## Data compatibility

Both components read and write the same `grc_filtercriterion` rows.

- **Either earlier shape → this variant: lossless.** Rows carrying no type
  condition are recognised as the older storage shape, and an equivalent type
  condition is injected — per-block rows become an OR of AND groups each keeping
  its own type; a shared type list becomes one `Type in (...)` condition. The
  injected conditions are new rows, so the loaded filter is marked unsaved and a
  notice explains why; nothing is persisted until you deliberately save.
- **This variant → the original control:** lossy for anything the per-block
  model cannot represent, which is most of what this design adds.

Use separate scope set records per variant when comparing them.

## Tests

57 unit tests (`npm test`), all Dataverse-free:

- **fetchXmlCompiler** — the customer's `(Type = Office AND Location = Germany)
  OR (Type = Product)` example verbatim, plus proof that both earlier designs
  remain expressible, that the type column gets no special treatment in the XML,
  active-condition placement for AND and OR roots, arbitrary depth, operator
  mapping, XML escaping, and returning "" rather than an unbounded fetch
- **persistence** — type conditions as ordinary rows, the derived type list,
  round-trips including the customer's example, and lossless upgrades from both
  earlier storage shapes
- **config** — type-context inference (AND narrowing, OR ignored, intersection
  of multiple constraints, `ne`, contradictions, incomplete conditions),
  context-scoped attribute lists, gap detection, and `configJson` merging
