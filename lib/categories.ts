// lib/categories.ts

export const TARGET_CATEGORIES = [
  "\uC815\uCE58/\uACBD\uC81C/\uC0AC\uD68C",
  "\uACFC\uD559/\uAE30\uC220",
  "\uC608\uC220/\uBB38\uD654",
  "\uC2EC\uB9AC/\uC5D0\uC138\uC774",
  "\uC778\uBB38/\uCCA0\uD559",
  "\uBB38\uD559",
] as const;

export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export function isValidTargetCategory(value: string): value is TargetCategory {
  return TARGET_CATEGORIES.includes(value as TargetCategory);
}
