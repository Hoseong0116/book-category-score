// lib/scoring.ts

export type KeywordEvaluation = {
  keyword: string;
  weight: number;
  relevance: "direct" | "partial" | "weak" | "none" | "noise";
  multiplier: number;
  reason: string;
};

export function calculateTargetCategoryScore(evaluations: KeywordEvaluation[]) {
  const validItems = evaluations.filter((item) => item.relevance !== "noise");

  const totalValidWeight = validItems.reduce((sum, item) => {
    return sum + item.weight;
  }, 0);

  const weightedScore = validItems.reduce((sum, item) => {
    return sum + item.weight * item.multiplier;
  }, 0);

  if (totalValidWeight === 0) {
    return {
      totalValidWeight: 0,
      weightedScore: 0,
      score30: 0,
      percentage: 0,
    };
  }

  const percentage = (weightedScore / totalValidWeight) * 100;
  const score30 = (weightedScore / totalValidWeight) * 30;

  return {
    totalValidWeight,
    weightedScore,
    percentage: Number(percentage.toFixed(1)),
    score30: Number(score30.toFixed(1)),
  };
}