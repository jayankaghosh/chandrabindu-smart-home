import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { buildBackup } from "@/lib/backup";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Download a full backup as <timestamp>.cnbdu (admin only). The file contains
// secrets — treat it like a credential.
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  const bundle = buildBackup();
  const stamp = new Date(bundle.createdAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  logAction("BACKUP_DOWNLOAD", { files: Object.keys(bundle.files).length });
  return new NextResponse(JSON.stringify(bundle), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${stamp}.cnbdu"`,
      "Cache-Control": "no-store",
    },
  });
}
