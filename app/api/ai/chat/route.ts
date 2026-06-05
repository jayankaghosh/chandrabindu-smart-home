import { NextResponse } from "next/server";
import { getSession, guard, isRoomAccessible } from "@/lib/auth";
import { isAiEnabled } from "@/lib/config";
import { getDeviceRoomId } from "@/lib/store";
import { runAssistant } from "@/lib/chat";
import type { ChatMessage } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Assistant chat: returns a reply and (for commands) a list of proposed actions
// the client confirms before executing. Available to any signed-in user.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "AI features are turned off." },
      { status: 400 },
    );
  }

  let messages: ChatMessage[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.messages)) {
      messages = body.messages
        .filter(
          (m: any) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .map((m: any) => ({ role: m.role, content: m.content }));
    }
  } catch {
    messages = [];
  }
  if (!messages.length) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const username = getSession()!.username;
  try {
    const result = await runAssistant(username, messages);
    // Flag actions whose room is locked & not unlocked for this session.
    const actions = await Promise.all(
      result.actions.map(async (a) => {
        const roomId = await getDeviceRoomId(a.deviceId);
        return { ...a, locked: !isRoomAccessible(roomId) };
      }),
    );
    return NextResponse.json({
      reply: result.reply,
      actions,
      routines: result.routines,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
