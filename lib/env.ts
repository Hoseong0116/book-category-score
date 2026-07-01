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

  NAVER_CLIENT_ID: getRequiredEnv("NAVER_CLIENT_ID"),
  NAVER_CLIENT_SECRET: getRequiredEnv("NAVER_CLIENT_SECRET"),
};