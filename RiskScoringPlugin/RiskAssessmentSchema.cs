using System;
using System.Collections.Generic;

namespace Grc.RiskScoring
{
    /// <summary>
    /// Every grc_riskassessment column and choice value the engine touches, as read from the
    /// environment's metadata. If a column or choice changes, this is the only file to edit.
    /// </summary>
    internal static class RiskAssessmentSchema
    {
        public const string EntityName = "grc_riskassessment";
        public const string Status = "grc_assessmentstatus";
        public const string MethodVersion = "grc_assessmentmethodversion";

        public static readonly ScoreColumns Inherent = new ScoreColumns(
            "Inherent",
            new[]
            {
                "grc_inherentfinancialimpact",
                "grc_inherentcomplianceimpact",
                "grc_inherentreputationalimpact",
                "grc_inherentoperationalimpact"
            },
            likelihood: "grc_inherentlikelihood",
            maxImpact: "grc_maximuminherentimpact",
            score: "grc_calculatedinherentscore",
            rating: "grc_calculatedinherentriskrating");

        public static readonly ScoreColumns Residual = new ScoreColumns(
            "Current residual",
            new[]
            {
                "grc_currentresidualfinancialimpact",
                "grc_currentresidualcomplianceimpact",
                "grc_currentresidualreputationalimpact",
                "grc_currentresidualoperationalimpact"
            },
            likelihood: "grc_currentresiduallikelihood",
            maxImpact: "grc_maximumcurrentresidualimpact",
            score: "grc_calculatedcurrentresidualscore",
            rating: "grc_calculatedcurrentresidualriskrating");

        public static readonly ScoreColumns[] All = { Inherent, Residual };

        /// <summary>
        /// Assessment Status values in which impact and likelihood may still change.
        /// Submitted, Owner Confirmation Required, Under Review, Finalized and Superseded are frozen.
        /// </summary>
        public static readonly HashSet<int> EditableStatuses = new HashSet<int>
        {
            808400000, // Requested
            808400001, // In Progress
            808400005  // Rework Required
        };
    }

    /// <summary>
    /// Converts between choice option values and method scores. All four choices are global and
    /// list their options in ascending order of severity, starting at 808400000.
    /// </summary>
    internal static class ChoiceValues
    {
        private const int First = 808400000;

        // Impact (Low, Moderate, High, Very High) is shared by the eight impact columns and both
        // maximum impact columns. Likelihood is (Rare, Unlikely, Possible, Likely).
        // For both, the first option scores 1 and the fourth scores 4.
        public static int ToScale(int optionValue, string column)
        {
            int score = optionValue - First + 1;
            if (score < RiskScoringMethod.MinScale || score > RiskScoringMethod.MaxScale)
                throw new InvalidOperationException(string.Format(
                    "{0} has option value {1}, which the risk method has no score for.", column, optionValue));
            return score;
        }

        public static int FromScale(int score) => First + score - 1;

        // Risk rating options (Insignificant, Significant, Serious, Threatening) are Low, Medium, High, Critical.
        public static int FromRating(RiskRating rating) => First + (int)rating - 1;

        // The calculated score choice is labelled "1" to "16" in this order, values 808400000-808400008.
        private static readonly int[] ScoreLabels = { 1, 2, 3, 4, 6, 8, 9, 12, 16 };

        public static int FromScore(int score)
        {
            int index = Array.IndexOf(ScoreLabels, score);
            if (index < 0)
                throw new InvalidOperationException(string.Format("The score choice has no option for {0}.", score));
            return First + index;
        }
    }

    /// <summary>The input and output columns of one assessment (inherent or current residual).</summary>
    internal sealed class ScoreColumns
    {
        public ScoreColumns(string name, string[] impacts, string likelihood, string maxImpact, string score, string rating)
        {
            Name = name;
            Impacts = impacts;
            Likelihood = likelihood;
            MaxImpact = maxImpact;
            Score = score;
            Rating = rating;
        }

        public string Name { get; }
        public string[] Impacts { get; }
        public string Likelihood { get; }
        public string MaxImpact { get; }
        public string Score { get; }
        public string Rating { get; }

        /// <summary>Inputs and outputs together.</summary>
        public IEnumerable<string> AllColumns
        {
            get
            {
                foreach (string impact in Impacts) yield return impact;
                yield return Likelihood;
                yield return MaxImpact;
                yield return Score;
                yield return Rating;
            }
        }
    }
}
