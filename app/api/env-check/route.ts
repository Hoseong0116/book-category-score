// app/api/env-check/route.ts

import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    data4library: env.DATA4LIBRARY_API_KEY ? "설정됨" : "없음",
    anthropic: env.ANTHROPIC_API_KEY ? "설정됨" : "없음",
  });
}