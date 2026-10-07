using System;
using Microsoft.Xrm.Sdk;

namespace Grc.RiskScoring
{
    /// <summary>
    /// Calculates maximum impact, score and rating for the inherent and current residual
    /// assessments on grc_riskassessment.
    ///
    /// Register on PreOperation, Synchronous, for both Create and Update. The Update step needs a
    /// pre-image named "PreImage" containing the 16 score columns and grc_assessmentstatus.
    /// </summary>
    public sealed class CalculateRiskScores : IPlugin
    {
        public const string PreImageName = "PreImage";
        private const int PreOperationStage = 20;

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (!context.InputParameters.Contains("Target")) return;
            var target = context.InputParameters["Target"] as Entity;
            if (target == null || target.LogicalName != RiskAssessmentSchema.EntityName) return;

            if (context.Stage != PreOperationStage)
                throw new InvalidPluginExecutionException("Risk scoring must be registered on the PreOperation stage.");

            bool isUpdate = context.MessageName == "Update";
            Entity pre = null;
            if (isUpdate)
            {
                if (!context.PreEntityImages.Contains(PreImageName))
                    throw new InvalidPluginExecutionException(
                        "Risk scoring is missing its pre-image. Register an image named " + PreImageName + " on the Update step.");
                pre = context.PreEntityImages[PreImageName];
            }

            try
            {
                // The status the record had before this save decides whether it may change.
                if (IsFrozen(isUpdate ? pre : target))
                {
                    // A Create in a frozen status is migrated history: keep the values as supplied.
                    if (isUpdate) RejectChanges(target, pre);
                    return;
                }

                bool scored = false;
                foreach (ScoreColumns set in RiskAssessmentSchema.All)
                {
                    if (isUpdate && !Touches(target, set)) continue;
                    scored |= Apply(target, pre, set, tracing);
                }

                if (scored)
                    target[RiskAssessmentSchema.MethodVersion] = RiskScoringMethod.Version;
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracing.Trace(ex.ToString());
                throw new InvalidPluginExecutionException("Risk scoring failed: " + ex.Message, ex);
            }
        }

        private static bool IsFrozen(Entity record)
        {
            var status = record.GetAttributeValue<OptionSetValue>(RiskAssessmentSchema.Status);
            return status != null && !RiskAssessmentSchema.EditableStatuses.Contains(status.Value);
        }

        // Once an assessment is submitted, its values and results stay as they were rated.
        private static void RejectChanges(Entity target, Entity pre)
        {
            foreach (ScoreColumns set in RiskAssessmentSchema.All)
            {
                foreach (string column in set.AllColumns)
                {
                    if (Changes(target, pre, column))
                        throw new InvalidPluginExecutionException(
                            "This risk assessment is no longer editable, so its impact, likelihood and calculated risk can't be changed.");
                }
            }
        }

        // Scores one assessment into the target. Returns true when it was complete and scored.
        private static bool Apply(Entity target, Entity pre, ScoreColumns set, ITracingService tracing)
        {
            var impacts = new int[set.Impacts.Length];
            for (int i = 0; i < set.Impacts.Length; i++)
            {
                OptionSetValue impact = Current(target, pre, set.Impacts[i]);
                if (impact == null)
                {
                    Clear(target, set);
                    return false;
                }
                impacts[i] = ChoiceValues.ToScale(impact.Value, set.Impacts[i]);
            }

            OptionSetValue likelihood = Current(target, pre, set.Likelihood);
            if (likelihood == null)
            {
                Clear(target, set);
                return false;
            }

            RiskScore result = RiskScoringMethod.Calculate(impacts, ChoiceValues.ToScale(likelihood.Value, set.Likelihood));

            target[set.MaxImpact] = new OptionSetValue(ChoiceValues.FromScale(result.MaxImpact));
            target[set.Score] = new OptionSetValue(ChoiceValues.FromScore(result.Score));
            target[set.Rating] = new OptionSetValue(ChoiceValues.FromRating(result.Rating));

            tracing.Trace("{0}: max impact {1}, likelihood {2}, score {3}, rating {4}.",
                set.Name, result.MaxImpact, result.Likelihood, result.Score, result.Rating);
            return true;
        }

        // An incomplete assessment has no result, so an earlier one must not be left behind.
        private static void Clear(Entity target, ScoreColumns set)
        {
            target[set.MaxImpact] = null;
            target[set.Score] = null;
            target[set.Rating] = null;
        }

        // The value after this save: from the target if it is being written, otherwise the stored one.
        private static OptionSetValue Current(Entity target, Entity pre, string column)
        {
            if (target.Contains(column)) return target.GetAttributeValue<OptionSetValue>(column);
            return pre == null ? null : pre.GetAttributeValue<OptionSetValue>(column);
        }

        private static bool Touches(Entity target, ScoreColumns set)
        {
            foreach (string column in set.AllColumns)
            {
                if (target.Contains(column)) return true;
            }
            return false;
        }

        private static bool Changes(Entity target, Entity pre, string column)
        {
            if (!target.Contains(column)) return false;
            OptionSetValue after = target.GetAttributeValue<OptionSetValue>(column);
            OptionSetValue before = pre.GetAttributeValue<OptionSetValue>(column);
            int? afterValue = after == null ? (int?)null : after.Value;
            int? beforeValue = before == null ? (int?)null : before.Value;
            return afterValue != beforeValue;
        }
    }
}
