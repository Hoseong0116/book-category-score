// lib/env.ts

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다.`);
  }

  return value;
}

export const env = {
  DATA4LIBRARY_API_KEY: getRequiredEnv("DATA4LIBRARY_API_KEY"),
  ANTHROPIC_API_KEY: getRequiredEnv("ANTHROPIC_API_KEY"),
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",

  // 국립중앙도서관 API 키는 책 검색 보조용.
  // 키가 없으면 국립중앙도서관 검색만 건너뜀.
  NATIONAL_LIBRARY_API_KEY: process.env.NATIONAL_LIBRARY_API_KEY || "",
};