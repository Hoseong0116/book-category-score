// app/api/manual-score/route.ts

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isValidTargetCategory } from "@/lib/categories";
import {
  calculateTargetCategoryScore,
  KeywordEvaluation,
} from "@/lib/scoring";

function extractFirstJsonArray(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("[");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "[") {
      depth++;
    }

    if (char === "]") {
      depth--;

      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return null;
}

function safeJsonParseFromClaude(text: string): KeywordEvaluation[] {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed.evaluations)) {
      return parsed.evaluations;
    }
  } catch {
    // 아래에서 배열만 따로 추출
  }

  const jsonArrayText = extractFirstJsonArray(cleaned);

  if (!jsonArrayText) {
    throw new Error(`Claude 응답에서 JSON 배열을 찾지 못했습니다. 원문: ${text}`);
  }

  try {
    const parsed = JSON.parse(jsonArrayText);

    if (!Array.isArray(parsed)) {
      throw new Error("추출된 JSON이 배열이 아닙니다.");
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Claude JSON 파싱 실패: ${
        error instanceof Error ? error.message : String(error)
      }\n원문: ${text}`
    );
  }
}

async function analyzeManualTextWithClaude(params: {
  bookname: string;
  targetCategory: string;
  manualText: string;
}) {
  const prompt = `
너는 독서 동아리 '글그사'의 도서 카테고리 적합도 평가기다.

목표:
사용자가 직접 입력한 책 소개/목차/서문 일부를 바탕으로,
사용자가 선택한 목표 카테고리에 대한 책의 적합도를 평가한다.

책 정보:
- 책 제목: ${params.bookname || "알 수 없음"}
- 사용자가 선택한 목표 카테고리: ${params.targetCategory}

목표 카테고리 목록:
- 사회/정치/법률
- 철학/역사/인류
- 자연과학/기술/미래
- 심리/교육/에세이
- 예술/문화
- 문학

작업:
1. 입력 텍스트에서 핵심 키워드 20~30개를 추출한다.
2. 각 키워드에 1~10 사이의 weight를 부여한다.
   - 책의 핵심 주제일수록 높은 점수.
   - 단순 배경 정보나 부가 설명이면 낮은 점수.
3. 각 키워드가 목표 카테고리와 얼마나 관련 있는지 relevance로 평가한다.
4. relevance에 맞는 multiplier를 부여한다.

관련도 기준:
1. direct:
   목표 카테고리와 직접 관련 있음.
   multiplier는 1.0.

2. partial:
   목표 카테고리와 부분적으로 관련 있음.
   예: 자연과학/기술/미래 카테고리에서 '인간', '윤리', '사회'처럼 기술·과학 주제와 연결되는 보조 개념.
   multiplier는 0.5.

3. weak:
   약하게 관련 있음.
   multiplier는 0.25.

4. none:
   의미는 있지만 목표 카테고리와 관련 없음.
   multiplier는 0.

5. noise:
   인명, 출판사명, 외국어 조각, 불용어, 의미 불명확한 단어.
   multiplier는 0.

중요 규칙:
- 키워드 단어 하나만 보고 판단하지 말고, 책 제목과 전체 텍스트의 흐름을 함께 고려해라.
- '인간', '사회', '윤리', '미래'처럼 여러 분야에 걸칠 수 있는 단어는 목표 카테고리와의 관계를 기준으로 판단해라.
- 입력 텍스트에 없는 내용을 상상해서 추가하지 마라.
- 출력은 JSON 배열만 해라.
- 설명 문장, markdown, 코드블록은 절대 넣지 마라.

입력 텍스트:
${params.manualText}

출력 형식:
[
  {
    "keyword": "우주",
    "weight": 10,
    "relevance": "direct",
    "multiplier": 1.0,
    "reason": "입력 텍스트의 핵심 주제이며 목표 카테고리와 직접 관련됨"
  },
  {
    "keyword": "인간",
    "weight": 7,
    "relevance": "partial",
    "multiplier": 0.5,
    "reason": "과학적 주제와 연결되는 보조 개념으로 사용됨"
  }
]
`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 2500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API 호출 실패: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;

  if (!text) {
    throw new Error("Claude 응답 텍스트가 비어 있습니다.");
  }

  return safeJsonParseFromClaude(text);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const bookname = String(body.bookname || "").trim();
    const targetCategory = String(body.targetCategory || "").trim();
    const manualText = String(body.manualText || "").trim();

    if (!targetCategory) {
      return NextResponse.json(
        { error: "targetCategory 값이 필요합니다." },
        { status: 400 }
      );
    }

    if (!isValidTargetCategory(targetCategory)) {
      return NextResponse.json(
        {
          error: "targetCategory 값이 올바르지 않습니다.",
          allowedCategories: [
            "사회/정치/법률",
            "철학/역사/인류",
            "자연과학/기술/미래",
            "심리/교육/에세이",
            "예술/문화",
            "문학",
          ],
        },
        { status: 400 }
      );
    }

    if (!manualText) {
      return NextResponse.json(
        { error: "manualText 값이 필요합니다." },
        { status: 400 }
      );
    }

    if (manualText.length < 50) {
      return NextResponse.json(
        { error: "분석할 텍스트가 너무 짧습니다. 책 소개나 목차를 조금 더 입력해주세요." },
        { status: 400 }
      );
    }

    const evaluations = await analyzeManualTextWithClaude({
      bookname,
      targetCategory,
      manualText,
    });

    const score = calculateTargetCategoryScore(evaluations);

    return NextResponse.json({
      status: "OK",
      source: "manual_text",
      book: {
        bookname,
      },
      targetCategory,
      score,
      evaluations,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "수동 텍스트 분석 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}