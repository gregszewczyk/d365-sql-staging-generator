# Object Scope Set Filter Builder — multi-type variant

A **separate PCF component** (`GRC.ObjectScopeSetFilterBuilderMulti`) that can be
installed alongside the original `GRC.ObjectScopeSetFilterBuilder` in the same
environment, so both designs can be demoed and swapped on the form while the
customer decides which they want.

**Current state:** an exact functional copy of the original control, renamed so
the two can coexist. The multi-type behaviour is **not yet implemented** —
see "Planned change" below. It builds, tests, packages and deploys today.

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

## Planned change (not yet built)

Each type block becomes pinnable to **several** source object types, so a shared
attribute like Criticality is specified once for Server + Application rather
than duplicated per block. Blocks still OR together, so per-type conditions
("production apps **plus** their Windows servers") remain expressible.

- `TypeBlockNode.objectType: string` → `objectTypes: string[]`
- Pinning condition `eq` → `in` with `<value>` children; a single-type block
  keeps emitting `eq`, so existing output is unchanged
- Attribute picker offers the **intersection** of the selected types'
  attributes — offering a non-applicable attribute would silently drop every
  object of the types that lack it (nulls never match)
- `grc_sourceobjecttype` stores a `;`-delimited list **only when a block has 2+
  types**, so single-type blocks stay byte-identical to the original control's
  rows and round-trip between the two components cleanly

### Data compatibility between the two components

Both read and write the same `grc_filtercriterion` rows.

- **Original → multi:** clean; a single type loads as a one-item list.
- **Multi → original:** lossy for genuinely multi-type blocks —
  `grc_sourceobjecttype` of `"Server;Application"` matches no configured type,
  so the block loads with an empty type picker.

Use separate scope set records per variant when demoing, so neither can
misread the other's criteria.
