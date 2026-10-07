# Risk scoring plugin (GTI-92 RA-02, RA-03)

Calculates the maximum impact, score and rating on `grc_riskassessment` for both the
inherent assessment (RA-02) and the current residual assessment (RA-03), using the
approved Standard Risk method:

```
score  = max(financial, compliance, reputational, operational) x likelihood
rating = approved matrix (max impact, likelihood)
```

| File | What it holds |
|---|---|
| `RiskScoringMethod.cs` | The method itself: the 16-cell matrix and the calculation, on 1-4 scores. No Dataverse types |
| `RiskAssessmentSchema.cs` | Every column name and choice value the plugin touches. The only file to edit if the schema changes |
| `CalculateRiskScores.cs` | The `IPlugin`: reads the record, calls the method, writes the results back into the same save |

## Deploy from a ZIP download

Paths below assume Windows and a short working folder, `C:\dev`. Keep it short: long paths
broke the PCF build on this machine before.

### 1 · Get the code

Download the branch as a ZIP. It must be this branch, not `main`, which doesn't have the plugin:

```
https://github.com/gregszewczyk/d365-sql-staging-generator/archive/refs/heads/claude/pcf-control-from-md-swk659.zip
```

Extract it into `C:\dev`. The plugin source is then in:

```
C:\dev\d365-sql-staging-generator-claude-pcf-control-from-md-swk659\RiskScoringPlugin
```

### 2 · Build the DLL

You need the .NET SDK and `pac`, the same tools the PCF build used. In PowerShell:

```powershell
mkdir C:\dev\RiskScoring
cd C:\dev\RiskScoring
pac plugin init
Remove-Item Plugin1.cs
Copy-Item C:\dev\d365-sql-staging-generator-claude-pcf-control-from-md-swk659\RiskScoringPlugin\*.cs .
dotnet build -c Release
```

`pac plugin init` creates a .NET Framework 4.6.2 project with the Dataverse SDK and a signing
key. Leave its `PluginBase.cs` where it is; it does no harm.

A successful build ends with `Build succeeded` and produces:

```
C:\dev\RiskScoring\bin\Release\net462\RiskScoring.dll
```

These files were written for C# 7.3 but couldn't be compiled where they were written. If the
build reports errors, copy the error lines back rather than editing around them.

### 3 · Register the assembly

Open the Plugin Registration Tool and connect to the **DEV** environment.

1. **Register** → **Register New Assembly**
2. Step 1: browse to `RiskScoring.dll`
3. Step 2: tick the assembly and `Grc.RiskScoring.CalculateRiskScores`
4. Isolation mode **Sandbox**, location **Database**
5. **Register Selected Plugins**

The tree now shows `(Assembly) RiskScoring` with `(Plugin) Grc.RiskScoring.CalculateRiskScores` under it.

### 4 · Register the Create step

Right-click `(Plugin) Grc.RiskScoring.CalculateRiskScores` → **Register New Step**:

| Field | Value |
|---|---|
| Message | `Create` |
| Primary Entity | `grc_riskassessment` |
| Event Pipeline Stage | **PreOperation** |
| Execution Mode | **Synchronous** |
| Deployment | Server |

Leave everything else as it is → **Register New Step**.

### 5 · Register the Update step

Same again, with these differences:

| Field | Value |
|---|---|
| Message | `Update` |
| Filtering Attributes | Click **…**, untick all, then tick the 16 score columns listed below |

### 6 · Add the pre-image to the Update step

Right-click the **Update** step → **Register New Image**:

| Field | Value |
|---|---|
| Image type | **Pre Image** ticked, Post Image unticked |
| Name | `PreImage` |
| Entity Alias | `PreImage` |
| Parameters | Click **…** and tick the 16 score columns plus **Assessment Status** (`grc_assessmentstatus`) |

The **Entity Alias** must be exactly `PreImage`, capital P and I. The plugin looks the image up
by that alias. If it's wrong, every update fails with "Risk scoring is missing its pre-image".

### 7 · Add it to the solution

In make.powerapps.com, open the solution:

1. **Add existing** → **More** → **Developer** → **Plug-in assembly** → `RiskScoring`
2. **Add existing** → **More** → **Developer** → **Plug-in step** → both steps

The image travels with its step. From here, TEST and production get the plugin through the
normal solution export and import. Nothing needs re-entering per environment.

### 8 · Smoke test

Open a Risk Assessment in **In Progress**, fill in the four inherent impacts and the likelihood,
and save. Maximum Inherent Impact, Calculated Inherent Score and Calculated Inherent Risk Rating
should fill in. The full test list is at the end of this file.

If a save shows an error, turn on the trace log (**Settings** → **Administration** →
**System Settings** → **Customization** → **Enable logging to plug-in trace log: All**), save
again, and look under **Plug-in Trace Log** in Advanced Settings.

### Updating the plugin later

Rebuild, then in the Plugin Registration Tool select `(Assembly) RiskScoring` → **Update** →
browse to the new DLL → **Update Selected Plugins**. The steps and image stay registered.

### The 16 score columns

```
grc_inherentfinancialimpact, grc_inherentcomplianceimpact, grc_inherentreputationalimpact,
grc_inherentoperationalimpact, grc_inherentlikelihood, grc_maximuminherentimpact,
grc_calculatedinherentscore, grc_calculatedinherentriskrating,
grc_currentresidualfinancialimpact, grc_currentresidualcomplianceimpact,
grc_currentresidualreputationalimpact, grc_currentresidualoperationalimpact,
grc_currentresiduallikelihood, grc_maximumcurrentresidualimpact,
grc_calculatedcurrentresidualscore, grc_calculatedcurrentresidualriskrating
```

The calculated columns are in the filter on purpose: if anything writes one directly, the
plugin fires and puts the correct value back.

## Behaviour

- **Recalculates on every save that touches an assessment.** A save that only changes
  residual values leaves the inherent results alone, and the other way round.
- **Incomplete means blank.** If any of the five inputs is empty, max impact, score and
  rating are cleared. An emptied field never leaves an earlier rating behind.
- **Stamps the method version** (`IRM 1.0`) in `grc_assessmentmethodversion` whenever it
  produces a result.
- **Frozen once submitted.** In Submitted, Owner Confirmation Required, Under Review,
  Finalized and Superseded, any change to the 16 columns is rejected and nothing is
  recalculated. Requested, In Progress and Rework Required are editable.
- **Migrated history is kept.** A record created directly in a frozen status keeps the
  values it was created with.
- **Prior scores are never adopted.** When RA-08 copies a previous assessment, the plugin
  recalculates from the copied inputs on Create.
- **Overrides are untouched.** `grc_inherentoverrideflag`, `grc_inherentoverridevalue` and
  `grc_inherentoverriderationale` are neither read nor written.
- **Unknown choice values fail loudly.** If someone adds an option to the impact or
  likelihood choice (an "N/A", say), saving with it gives an error naming the column,
  rather than a wrong rating.

## How choice values map to scores

All four choices are global and list their options in ascending order of severity,
starting at 808400000. The plugin depends on the option **values**, not the labels.

| Score | Impact option | Likelihood option | Rating option |
|---|---|---|---|
| 1 | 808400000 Low | 808400000 Rare | 808400000 Insignificant = Low |
| 2 | 808400001 Moderate | 808400001 Unlikely | 808400001 Significant = Medium |
| 3 | 808400002 High | 808400002 Possible | 808400002 Serious = High |
| 4 | 808400003 Very High | 808400003 Likely | 808400003 Threatening = Critical |

The score choice has labels `1, 2, 3, 4, 6, 8, 9, 12, 16` on values 808400000 to 808400008.

**The labels don't match GTI-92.** The story (updated 28 Sep) names the scales
Minor / Moderate / Major / Severe, Very Unlikely / Unlikely / Likely / Very Likely and
Low / Medium / High / Critical. Relabelling the options to match is safe for the plugin
as long as the values stay the same.

## Test

| Case | Do | Expect |
|---|---|---|
| Maximum, not average | Impacts Low, Low, Low, Very High · likelihood Unlikely | Max Very High · score 8 · Serious (High) |
| Corners | Low/Rare, Low/Likely, Very High/Rare, Very High/Likely | 1 Insignificant · 4 Significant · 4 Significant · 16 Threatening |
| Incomplete | Fill three impacts and the likelihood | Max impact, score and rating blank |
| Cleared | Complete it, then blank one impact | Results disappear |
| Tamper | On a complete record, write the rating directly via the API | Correct rating put back |
| Residual only | Change a residual impact | Residual results change; inherent untouched |
| Frozen | Set status to Submitted, then change an impact | Save blocked with a clear message |
| Rework | Set status to Rework Required, change an impact | Recalculates |
| Prefill | Create with copied inputs and a stale score | Score recalculated from the inputs |
