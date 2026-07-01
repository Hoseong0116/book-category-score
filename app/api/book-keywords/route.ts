// app/api/book-keywords/route.ts

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isbn13 = searchParams.get("isbn13");

  if (!isbn13) {
    return NextResponse.json(
      { error: "isbn13 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const apiUrl = new URL("https://data4library.kr/api/keywordList");
  apiUrl.searchParams.set("authKey", env.DATA4LIBRARY_API_KEY);
  apiUrl.searchParams.set("isbn13", isbn13);
  apiUrl.searchParams.set("additionalYN", "Y");
  apiUrl.searchParams.set("format", "json");

  try {
    const response = await fetch(apiUrl.toString(), {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "도서관 정보나루 keywordList API 호출 실패" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}