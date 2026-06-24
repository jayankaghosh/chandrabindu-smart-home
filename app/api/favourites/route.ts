import { NextResponse } from "next/server";
import { getSession, guard } from "@/lib/auth";
import { readFavourites, toggleFavourite } from "@/lib/favourites";

export const dynamic = "force-dynamic";

// The current user's starred controls. Per-user — every signed-in user has their
// own Favourites list.
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  const user = getSession()!.username;
  return NextResponse.json({ favourites: readFavourites(user) });
}

// Star / unstar a single control. Body: { deviceId, code, favourite }.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const user = getSession()!.username;

  let deviceId = "";
  let code = "";
  let favourite = false;
  try {
    const body = await req.json();
    deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
    code = typeof body?.code === "string" ? body.code : "";
    favourite = Boolean(body?.favourite);
  } catch {
    /* fall through to validation */
  }
  if (!deviceId || !code) {
    return NextResponse.json(
      { error: "deviceId and code are required" },
      { status: 400 },
    );
  }

  const favourites = toggleFavourite(user, deviceId, code, favourite);
  return NextResponse.json({ favourites });
}
