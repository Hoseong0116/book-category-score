// app/api/target-score/route.ts

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isValidTargetCategory } from "@/lib/categories";
import {
  calculateTargetCategoryScore,
  KeywordEvaluation,
} from "@/lib/scoring";

type ParsedKeyword = {
  keyword: string;
  weight: number;
};

function toArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "object") {
    if (Array.isArray(value.keyword)) return value.keyword;
    if (Array.isArray(value.keywords)) return value.keywords;
    if (Array.isArray(value.item)) return value.item;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.doc)) return value.doc;
    if (Array.isArray(value.docs)) return value.docs;
  }

  return [value];
}

function extractKeywordsFromData4Library(data: unknown): ParsedKeyword[] {
  const raw = data as any;

  const possibleContainers = [
    raw?.response?.keywords,
    raw?.response?.keyword,
    raw?.response?.items,
    raw?.response?.item,
    raw?.response?.docs,
    raw?.keywords,
    raw?.keyword,
    raw?.items,
    raw?.item,
    raw?.docs,
  ];

  const keywordItems = possibleContainers.flatMap(toArray);

  return keywordItems
    .map((item: any) => {
      const source =
        item?.keyword ||
        item?.keywords ||
        item?.item ||
        item?.doc ||
        item;

      const keyword =
        source?.word ||
        source?.keyword ||
        source?.keywordNm ||
        source?.keywordName ||
        source?.name ||
        source?.kwd ||
        source?.text ||
        source?.term ||
        source?.kwrd ||
        "";

      const weightRaw =
        source?.weight ||
        source?.weightValue ||
        source?.score ||
        source?.value ||
        source?.count ||
        source?.rank ||
        1;

      const weight = Number(weightRaw);

      return {
        keyword: String(keyword).trim(),
        weight: Number.isFinite(weight) ? weight : 1,
      };
    })
    .filter((item: ParsedKeyword) => item.keyword.length > 0);
}

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

async function fetchKeywordList(isbn13: string) {
  const apiUrl = new URL("https://data4library.kr/api/keywordList");
  apiUrl.searchParams.set("authKey", env.DATA4LIBRARY_API_KEY);
  apiUrl.searchParams.set("isbn13", isbn13);
  apiUrl.searchParams.set("additionalYN", "Y");
  apiUrl.searchParams.set("format", "json");

  const response = await fetch(apiUrl.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("도서관 정보나루 keywordList API 호출 실패");
  }

  return response.json();
}

async function evaluateKeywordsWithClaude(params: {
  bookname: string;
  classNm: string;
  targetCategory: string;
  keywords: ParsedKeyword[];
}) {
  const prompt = `
너는 독서 동아리 '글그사'의 도서 카테고리 적합도 평가기다.

목표:
사용자가 선택한 목표 카테고리에 대해, 각 키워드가 얼마나 관련 있는지 평가한다.

책 정보:
- 책 제목: ${params.bookname || "알 수 없음"}
- 도서관 분류명: ${params.classNm || "알 수 없음"}
- 사용자가 선택한 목표 카테고리: ${params.targetCategory}

목표 카테고리 목록:
- 정치/경제/사회
- 과학/기술
- 예술/문화
- 심리/에세이
- 인문/철학
- 문학

관련도 기준:
1. direct:
   목표 카테고리와 직접 관련 있음.
   multiplier는 1.0.

2. partial:
   목표 카테고리와 부분적으로 관련 있음.
   예: 기술 카테고리에서 '윤리', '인간', '사회'처럼 주제와 연결되는 보조 개념.
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

[점수 산정 분모 및 noise 처리 강화 규칙]

카테고리 점수의 분모에는 책의 실제 내용, 주제, 소재, 논점, 배경을 판단하는 데 사용할 수 있는 유효 키워드만 포함한다.

relevance가 "noise"인 키워드는 점수 계산의 분모와 분자에서 모두 제외된다. 따라서 책의 실제 내용 판단에 사용할 수 없는 키워드는 반드시 noise로 분류해야 한다.

relevance가 "none"인 키워드는 분모에는 포함되지만 점수는 0으로 계산된다. 따라서 none은 "책의 실제 내용과 관련은 있지만 targetCategory와 관련이 없는 키워드"에만 사용한다.

다음 항목은 책의 실제 내용 주제를 판단하는 근거가 아니므로 반드시 relevance를 "noise", multiplier를 0으로 평가한다.

- 저자명
- 번역자명
- 등장인물명만 단독으로 나온 키워드
- 인명
- 출판사명
- 브랜드명
- 시리즈명
- 단순 제목 구성어
- 출판 연도
- 회차
- 문학상
- 과학문학상
- 수상작
- 대상
- 후보작
- 베스트셀러
- 추천도서
- 선정도서
- 올해의 책
- 심사평
- 홍보 문구
- 불용어
- 검색 잡음

수상 이력, 홍보성 메타데이터, 외부 평가 정보는 targetCategory와 단어상 관련이 있어 보여도 카테고리 적합도 판단 근거로 사용하지 않는다. 예를 들어 "한국과학문학상"은 "과학"이라는 단어가 포함되어 있어도 과학/기술 내용 키워드가 아니라 수상 이력이므로 noise로 처리한다.

단순 제목 구성어는 기본적으로 noise로 처리한다. 다만 제목에 포함된 단어가 책의 실제 핵심 주제나 반복적으로 등장하는 내용 키워드임이 명확한 경우에만 none, weak, partial, direct 중 하나로 평가할 수 있다.

책의 실제 내용이나 주제와 관련된 키워드는 targetCategory와 관련이 없더라도 noise가 아니라 none으로 평가한다. 이는 해당 책이 targetCategory와 얼마나 맞지 않는지도 점수에 반영하기 위함이다.

targetCategory와 관련 있는 실제 내용 키워드는 관련 강도에 따라 weak, partial, direct로 평가한다.

정리:
- noise: 책 내용 판단에 사용할 수 없는 메타데이터, 인명, 제목 구성어, 수상 이력, 홍보 문구, 불용어, 검색 잡음
- none: 책 내용 키워드이지만 targetCategory와 관련 없음
- weak: 책 내용 키워드이며 targetCategory와 약하게 관련 있음
- partial: 책 내용 키워드이며 targetCategory와 부분적으로 관련 있음
- direct: 책 내용 키워드이며 targetCategory와 직접적으로 관련 있음

중요 규칙:
- 키워드 단어 하나만 보고 판단하지 말고, 책 제목, 도서관 분류명, 전체 키워드 흐름을 함께 고려해라.
- '인간', '사회', '윤리', '미래'처럼 여러 분야에 걸칠 수 있는 단어는 목표 카테고리와의 관계를 기준으로 판단해라.
- 출력은 JSON 배열만 해라.
- 설명 문장, markdown, 코드블록은 절대 넣지 마라.
- 제공된 키워드 중 상위 30개만 평가한다.
- JSON 배열은 반드시 완결된 형태로 닫아라.

[추가 평가 규칙]

문학 작품이 비문학 카테고리에 들어온 경우에는 비문학 적합도를 보수적으로 평가한다. 책이 소설, 시, 희곡, SF 장편소설, 판타지, 한국소설, 해외소설 등 문학 작품으로 판단되고 targetCategory가 "문학"이 아닌 경우, 과학/기술, 정치/경제/사회, 인문/철학, 심리/에세이, 예술/문화 관련 키워드가 등장하더라도 그것이 소설의 장르, 배경, 소재, 설정에 해당하면 direct 또는 partial을 쉽게 부여하지 않는다. 이러한 소재성 키워드는 기본적으로 weak, multiplier 0.25로 평가한다. 판단 근거에는 "소설/문학 작품의 소재이므로 비문학 카테고리의 직접 근거로 보기는 어렵다"는 취지를 포함한다.

수상 이력, 홍보 문구, 외부 평가 메타데이터는 카테고리 판단 근거로 사용하지 않는다. 문학상, 과학문학상, 수상작, 대상, 후보작, 베스트셀러, 추천도서, 선정도서, 올해의 책, 작가상, 출판사상, 노벨문학상, 부커상 등은 relevance를 "noise", multiplier를 0으로 평가한다. 판단 근거에는 "수상 이력 또는 홍보성 메타데이터로, 책의 실제 내용 주제를 판단하는 근거가 아니므로 noise 처리"라고 작성한다.

저자명, 번역자명, 인명, 출판사명, 브랜드명, 시리즈명, 단순 제목 구성어, 검색 잡음은 카테고리 판단 근거로 사용하지 않고 relevance를 "noise", multiplier를 0으로 평가한다.

단, 책이 실제 과학 교양서, 사회과학서, 철학서, 심리학서, 역사서, 예술 이론서처럼 비문학적 설명과 지식 전달을 목적으로 하는 도서라면 문학 작품 제한 규칙을 적용하지 않는다.



입력 키워드:
${JSON.stringify(params.keywords, null, 2)}

출력 형식:
[
  {
    "keyword": "우주",
    "weight": 17,
    "relevance": "direct",
    "multiplier": 1.0,
    "reason": "목표 카테고리와 직접 관련된 핵심 주제어"
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
      max_tokens: 4000,
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const isbn13 = searchParams.get("isbn13");
  const targetCategory = searchParams.get("targetCategory");
  const bookname = searchParams.get("bookname") || "";
  const classNm = searchParams.get("classNm") || "";

  if (!isbn13) {
    return NextResponse.json(
      { error: "isbn13 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  if (!targetCategory) {
    return NextResponse.json(
      { error: "targetCategory 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  if (!isValidTargetCategory(targetCategory)) {
    return NextResponse.json(
      {
        error: "targetCategory 값이 올바르지 않습니다.",
        allowedCategories: [
          "정치/경제/사회",
          "과학/기술",
          "예술/문화",
          "심리/에세이",
          "인문/철학",
          "문학",
        ],
      },
      { status: 400 }
    );
  }

  try {
    const keywordData = await fetchKeywordList(isbn13);
    const keywords = extractKeywordsFromData4Library(keywordData);

    if (keywords.length === 0) {
      return NextResponse.json({
        status: "NO_KEYWORDS",
        message:
          "도서관 정보나루에서 키워드 정보를 찾지 못했습니다. 수동 텍스트 입력 방식으로 분석해야 합니다.",
        isbn13,
        targetCategory,
      });
    }

    const limitedKeywords = keywords
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 30);

    const evaluations = await evaluateKeywordsWithClaude({
      bookname,
      classNm,
      targetCategory,
      keywords: limitedKeywords,
    });

    const score = calculateTargetCategoryScore(evaluations);

    return NextResponse.json({
      status: "OK",
      book: {
        isbn13,
        bookname,
        classNm,
      },
      targetCategory,
      score,
      keywords: limitedKeywords,
      evaluations,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "목표 카테고리 점수 계산 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}