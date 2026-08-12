# Object Scope Set Filter Builder — multi-type variant

A **separate PCF component** (`GRC.ObjectScopeSetFilterBuilderMulti`) that can be
installed alongside the original `GRC.ObjectScopeSetFilterBuilder` in the same
environment, so both designs can be demoed and swapped on the form while the
customer decides which they want.

**Current state:** multi-type behaviour implemented. The two components are now
visibly and functionally different — this one shows a shared type-pill selector
at the top and a single criteria tree, where the original shows stacked
per-type blocks.

## What this variant does differently

The scope set has **one shared list of source object types** and **one criteria
tree** that applies to all of them, so a shared attribute like Criticality is
stated once instead of repeated per type.

The type pin compiles to `eq` for a single type and `in` for several:

```xml
<filter type="and">
  <condition attribute="grc_objecttype" operator="in">
    <value>Server</value><value>Application</value>
  </condition>
  <condition attribute="grc_criticality" operator="eq" value="Tier 1" />
</filter>
```

**Known trade-off (customer-accepted):** because there is one shared tree, a
scope set can no longer express type-specific conditions. The brief's headline
example — *"internet-facing production applications, plus their Windows
production servers"* — is **not representable** in this design; it needs the
original control's per-type blocks. Returning to it is a design reversal, not a
tweak.

## Why a separate component rather than a second solution of the same control

PCF components are identified by `namespace.constructor`, not by which solution
carries them. Importing the same `namespace.constructor` from a second solution
does not produce a copy — it relocates/overwrites the first and leaves messy
solution layering. Everything that carries the component identity therefore
differs here:

| | Original | This variant |
|---|---|---|
| Constructor | `ObjectScopeSetFilterBuilder` | `ObjectScopeSetFilterBuilderMulti` |
| Display name | Object Scope Set Filter Builder | Object Scope Set Filter Builder (multi-type) |
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
npm test          # 21 tests, inherited from the original
```

## Package as its own solution

Deliberately a second, independent solution so that only the design the
customer picks gets promoted to test/prod:

`pac solution init` takes the solution's unique name from **the folder it runs
in** — there is no `--solution-name` argument. The original control's solution
was created in a folder called `solution`, so this one must use a different
folder name: same unique name would make importing this zip *update the
original solution* rather than sit beside it.

```bash
# from this folder
mkdir SolutionMulti && cd SolutionMulti
pac solution init --publisher-name grc --publisher-prefix grc
pac solution add-reference --path ..
dotnet build
```

Unique names must be alphanumeric — no hyphens or spaces. Verify before
importing that `SolutionMulti/src/Other/Solution.xml` contains
`<UniqueName>SolutionMulti</UniqueName>`; editing that element (and the
`<LocalizedName>` below it) is also a valid way to rename an already-inited
solution folder.

Import `SolutionMulti/bin/Debug/SolutionMulti.zip` through make.powerapps.com. Both
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
| Type scope | One shared list for the whole scope set | Customer preference; see trade-off above |
| Attribute picker with several types | **Intersection** only | Offering a non-applicable attribute would silently drop every object of the types that lack it — a condition never matches a null, so the user gets a smaller answer with nothing to explain it |
| Existing conditions when a type is added | **Kept and flagged**, never deleted | Non-destructive; the original control wipes conditions on type change. Flagged rows name the types that will not match |
| Type storage | `;`-delimited in `grc_sourceobjecttype`, **only when 2+ types** | No schema change, no migration; single-type filters write rows byte-identical to the original control's |

`grc_sourceobjecttype` must be a **Text** column for 2+ types — a delimited list
cannot be stored in a Choice column. A configured `choiceMaps.sourceObjectType`
still applies to single-type filters.

## Data compatibility between the two components

Both read and write the same `grc_filtercriterion` rows, and neither is fully
faithful to the other's model.

- **Original → this variant:** a single-block filter loads unchanged. A
  **multi-block** filter is converted — the types are unioned and each former
  block becomes an OR'd nested group. That is broader than the original
  (per-block type pins are lost), so the control shows a warning and marks the
  filter dirty so the conversion is never silently persisted.
- **This variant → original:** lossy for genuinely multi-type filters.
  `grc_sourceobjecttype` of `"Server;Application"` matches no configured type,
  so the block loads with an empty type picker.

Use separate scope set records per variant when demoing, so neither can
misread the other's criteria.

## Tests

41 unit tests (`npm test`), all Dataverse-free:

- **fetchXmlCompiler** — `eq` vs `in` pinning, shared conditions across types,
  AND-root flattening, OR-root nesting (the type pin must never be OR'd away),
  arbitrary depth, operator mapping, XML escaping, incomplete-condition skipping
- **persistence** — type-list serialisation, group-path encoding, full
  round-trip, row-id carry-through, and reading rows written by the original
  per-block control including the multi-block conversion
- **config** — intersection/union/gap helpers and `configJson` merging
