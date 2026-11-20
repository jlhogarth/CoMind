import { handleAedGet } from "@/lib/aed-monitor/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAedGet(request, (await context.params).id);
}
