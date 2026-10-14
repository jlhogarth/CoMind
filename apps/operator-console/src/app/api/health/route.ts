import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ service: "comind-operator-console", milestone: "OC-001", status: "ok" });
}
