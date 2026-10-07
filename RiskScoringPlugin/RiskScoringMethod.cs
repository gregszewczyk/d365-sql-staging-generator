using System;

namespace Grc.RiskScoring
{
    /// <summary>Risk Rating as defined by the approved method.</summary>
    public enum RiskRating
    {
        Low = 1,
        Medium = 2,
        High = 3,
        Critical = 4
    }

    /// <summary>The result of scoring one set of impact and likelihood values.</summary>
    public sealed class RiskScore
    {
        public RiskScore(int maxImpact, int likelihood, RiskRating rating)
        {
            MaxImpact = maxImpact;
            Likelihood = likelihood;
            Rating = rating;
        }

        /// <summary>Highest of the impact scores, 1-4.</summary>
        public int MaxImpact { get; }

        /// <summary>Likelihood score, 1-4.</summary>
        public int Likelihood { get; }

        /// <summary>Max impact x likelihood: one of 1, 2, 3, 4, 6, 8, 9, 12, 16.</summary>
        public int Score => MaxImpact * Likelihood;

        public RiskRating Rating { get; }
    }

    /// <summary>
    /// The Standard Risk scoring method (GTI-92 RA-02, reused by RA-03).
    /// Works on 1-4 scores only, with no Dataverse types, so it can be tested on its own.
    /// </summary>
    public static class RiskScoringMethod
    {
        /// <summary>Stamped on each assessment so a rating can be traced to the method that produced it.</summary>
        public const string Version = "IRM 1.0";

        public const int MinScale = 1;
        public const int MaxScale = 4;

        // Approved Risk Rating Matrix (GTI-92, Risk Assessment Approach v1.0).
        // Row = maximum impact score - 1, column = likelihood score - 1.
        private static readonly RiskRating[,] Matrix =
        {
            //  Very Unlikely      Unlikely           Likely               Very Likely
            { RiskRating.Low,    RiskRating.Low,    RiskRating.Medium,   RiskRating.Medium   }, // Minor (1)
            { RiskRating.Low,    RiskRating.Medium, RiskRating.Medium,   RiskRating.High     }, // Moderate (2)
            { RiskRating.Medium, RiskRating.Medium, RiskRating.High,     RiskRating.Critical }, // Major (3)
            { RiskRating.Medium, RiskRating.High,   RiskRating.Critical, RiskRating.Critical }  // Severe (4)
        };

        /// <summary>
        /// Scores one assessment. Impacts are never averaged: the highest one is the maximum impact.
        /// </summary>
        public static RiskScore Calculate(int[] impactScores, int likelihoodScore)
        {
            if (impactScores == null || impactScores.Length == 0)
                throw new ArgumentException("At least one impact score is required.", nameof(impactScores));

            int maxImpact = MinScale;
            foreach (int impact in impactScores)
            {
                EnsureOnScale(impact, nameof(impactScores));
                if (impact > maxImpact) maxImpact = impact;
            }
            EnsureOnScale(likelihoodScore, nameof(likelihoodScore));

            return new RiskScore(maxImpact, likelihoodScore, Matrix[maxImpact - 1, likelihoodScore - 1]);
        }

        private static void EnsureOnScale(int score, string parameter)
        {
            if (score < MinScale || score > MaxScale)
                throw new ArgumentOutOfRangeException(parameter, score, "Scores must be between 1 and 4.");
        }
    }
}
