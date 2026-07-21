export const TARGET_CATEGORIES = [
  "정치/경제/사회",
  "과학/기술",
  "예술/문화",
  "심리/에세이",
  "인문/철학",
  "문학",
] as const;

export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export function isValidTargetCategory(value: string): value is TargetCategory {
  return TARGET_CATEGORIES.includes(value as TargetCategory);
}