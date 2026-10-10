import { NextResponse } from "next/server";
import { getCurrentCurator } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { buildExport } from "@/lib/services/export-document";

export const dynamic = "force-dynamic";

export async function GET() {
  const curator = await getCurrentCurator();
  if (!curator) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const document = buildExport(getDb());
  return new NextResponse(JSON.stringify(document, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=good-dog-segments.json",
    },
  });
}
