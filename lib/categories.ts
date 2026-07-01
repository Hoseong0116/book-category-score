// lib/categories.ts

export const TARGET_CATEGORIES = [
  "사회/정치/법률",
  "철학/역사/인류",
  "자연과학/기술/미래",
  "심리/교육/에세이",
  "예술/문화",
  "문학",
] as const;

export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export function isValidTargetCategory(value: string): value is TargetCategory {
  return TARGET_CATEGORIES.includes(value as TargetCategory);
}