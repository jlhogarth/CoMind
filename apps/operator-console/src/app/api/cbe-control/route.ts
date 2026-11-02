import { NextResponse } from "next/server";
import {
  CbeControlUnavailableError,
  CbeControlValidationError,
  dispatchCbeControlAction,
  readCbeControlStatus,
} from "@/lib/cbe-control/server";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET() {
  try { return json(await readCbeControlStatus()); }
  catch (error) {
    console.error("CBE mobile control status read failed", { kind: error instanceof CbeControlUnavailableError ? error.kind : "unexpected" });
    return json({ error: "CBE control status is unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "Request body must be valid JSON." }, 400); }
  try { return json(await dispatchCbeControlAction(body), 202); }
  catch (error) {
    if (error instanceof CbeControlValidationError) return json({ error: error.message }, 400);
    if (error instanceof CbeControlUnavailableError) {
      console.error("CBE mobile control dispatch failed", { kind: error.kind });
      return json({ error: error.message, kind: error.kind }, error.kind === "configuration" ? 503 : 502);
    }
    console.error("CBE mobile control dispatch failed", { kind: "unexpected" });
    return json({ error: "CBE control action failed." }, 502);
  }
}
