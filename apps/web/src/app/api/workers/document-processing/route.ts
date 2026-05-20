import { NextResponse } from "next/server";
import { processNextDocumentProcessingMessage } from "@/lib/document/processing-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  // Vercel Cron이 호출하는 pull-based worker다. 한 번에 한 메시지만 처리해 함수 시간을 예측 가능하게 둔다.
  const result = await processNextDocumentProcessingMessage();
  return NextResponse.json(result);
}

export async function POST() {
  // 배포 후 수동 점검이나 재처리 확인을 위해 같은 worker를 POST로도 실행할 수 있게 둔다.
  const result = await processNextDocumentProcessingMessage();
  return NextResponse.json(result);
}
