import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { gatewayHealth } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// Device-gateway health for the admin settings UI.
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json(await gatewayHealth());
}
