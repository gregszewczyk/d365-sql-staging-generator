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

## Build

1. In an empty folder: `pac plugin init`. This creates a .NET Framework 4.6.2 class library
   with the Dataverse SDK reference and a signing key.
2. Delete the generated `Plugin1.cs`. Keep `PluginBase.cs` or delete it; this plugin doesn't use it.
3. Copy the three `.cs` files from this folder into the project.
4. `dotnet build -c Release`. The assembly is in `bin/Release/net462/`.

These files were written for C# 7.3, the default for a net462 project, and have not been
compiled in the environment they were written in. Expect to fix at most a typo on first build.

## Register (Plugin Registration Tool)

Register the assembly, then two steps on the `Grc.RiskScoring.CalculateRiskScores` type:

| | Create step | Update step |
|---|---|---|
| Message | Create | Update |
| Primary entity | `grc_riskassessment` | `grc_riskassessment` |
| Stage | PreOperation | PreOperation |
| Mode | Synchronous | Synchronous |
| Filtering attributes | (n/a) | The 16 score columns below |
| Image | None | Pre-image named `PreImage`: the 16 score columns plus `grc_assessmentstatus` |

The 16 score columns:

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
plugin fires and puts the correct value back. Add the assembly and both steps to the
solution; unlike a webhook, they hold nothing environment-specific.

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
