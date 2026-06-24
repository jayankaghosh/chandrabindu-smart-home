// Chandrabindu Smart Home — Telegram bot.
//
// A standalone process that controls the house purely through the existing
// Next.js REST API. Two ways to drive it:
//   • Menu navigation: rooms → switchboards → switches → actions (inline keyboards).
//   • Natural language: free text → /api/ai/chat → Confirm → /api/ai/execute.
//
// Auth: the user mints a pairing code in the web app's Settings and sends it
// with `/pair <code>`; the bot exchanges it for a session token (Bearer) and
// stores only that token. A Telegram-ID allowlist is the outer gate.

import { Bot, InlineKeyboard, type Context } from "grammy";
import { config, isAllowed } from "./config.js";
import { clearSession, getSession, setSession } from "./store.js";
import * as api from "./api.js";
import { ApiError, type AssistantAction, type ChatResponse } from "./api.js";
import {
  controlScreen,
  deviceScreen,
  esc,
  lookup,
  register,
  roomScreen,
  roomsScreen,
  routinesScreen,
} from "./ui.js";

const bot = new Bot(config.botToken);

// ── Per-chat in-memory conversation state (AI flow only) ────────────────────
const aiHistory = new Map<number, { role: "user" | "assistant"; content: string }[]>();
const aiPending = new Map<number, ChatResponse>();

const HTML = { parse_mode: "HTML" as const };

// ── Helpers ──────────────────────────────────────────────────────────────────

function chatId(ctx: Context): number {
  return ctx.chat?.id ?? ctx.from?.id ?? 0;
}

/** Token for this chat, or null if not paired. */
function tokenFor(ctx: Context): string | null {
  return getSession(chatId(ctx))?.token ?? null;
}

const PAIR_HINT =
  "You're not linked yet.\n\n" +
  "1. Open the web app → <b>Settings</b> → <b>Link a device</b>\n" +
  "2. Tap <b>Generate pairing code</b>\n" +
  "3. Send me <code>/pair 123456</code> with that code.";

/**
 * Run an API-backed handler with a paired token, translating ApiError into a
 * friendly reply. On 401 the stored token is cleared and the user is asked to
 * re-pair.
 */
async function withToken(ctx: Context, fn: (token: string) => Promise<void>): Promise<void> {
  const token = tokenFor(ctx);
  if (!token) {
    await ctx.reply(PAIR_HINT, HTML);
    return;
  }
  try {
    await fn(token);
  } catch (e) {
    const err = e as ApiError;
    if (err instanceof ApiError && err.unauthorized) {
      clearSession(chatId(ctx));
      await ctx.reply("Your session expired. Please pair again.\n\n" + PAIR_HINT, HTML);
    } else {
      await ctx.reply(`⚠️ ${esc(err.message || "Something went wrong.")}`, HTML);
    }
  }
}

/** Render a Screen as the reply to a command. */
async function sendScreen(ctx: Context, screen: { text: string; keyboard: InlineKeyboard }): Promise<void> {
  await ctx.reply(screen.text, { ...HTML, reply_markup: screen.keyboard });
}

/** Render a Screen by editing the message a button is attached to. */
async function editScreen(ctx: Context, screen: { text: string; keyboard: InlineKeyboard }): Promise<void> {
  try {
    await ctx.editMessageText(screen.text, { ...HTML, reply_markup: screen.keyboard });
  } catch {
    // Editing fails if the content is identical or the message is too old —
    // fall back to a fresh message.
    await ctx.reply(screen.text, { ...HTML, reply_markup: screen.keyboard });
  }
}

// ── Allowlist gate (applies to everything) ───────────────────────────────────
bot.use(async (ctx, next) => {
  if (!isAllowed(ctx.from?.id)) {
    // Stay quiet to strangers, but acknowledge callback taps so their client
    // doesn't show a spinner forever.
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "Not authorized." });
    else if (ctx.message) await ctx.reply("⛔ You're not authorized to use this bot.");
    return;
  }
  await next();
});

// ── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  if (!tokenFor(ctx)) {
    await ctx.reply("👋 Welcome to your smart home bot.\n\n" + PAIR_HINT, HTML);
    return;
  }
  await ctx.reply(
    "👋 You're linked. Use /menu to browse rooms, /routines to run a scene, " +
      "or just tell me what to do in plain language (e.g. “turn off the bedroom lights”).",
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "<b>Commands</b>\n" +
      "/menu — browse rooms → switches\n" +
      "/routines — run a saved routine\n" +
      "/pair &lt;code&gt; — link your account\n" +
      "/logout — unlink this chat\n\n" +
      "Or just type naturally, e.g. <i>“set the living room fan to medium”</i>.",
    HTML,
  );
});

bot.command("pair", async (ctx) => {
  const code = (ctx.match as string)?.trim();
  if (!code) {
    await ctx.reply("Send the code like this: <code>/pair 123456</code>", HTML);
    return;
  }
  // Remove the message so the code doesn't linger in the chat history.
  try {
    await ctx.deleteMessage();
  } catch {
    /* bot may lack delete permission in groups — ignore */
  }
  try {
    const { token, username, role } = await api.pair(code);
    setSession(chatId(ctx), { token, username, role });
    aiHistory.delete(chatId(ctx));
    await ctx.reply(`✅ Linked as <b>${esc(username)}</b>. Use /menu to get started.`, HTML);
  } catch (e) {
    const err = e as ApiError;
    await ctx.reply(`❌ ${esc(err.message || "Pairing failed.")}`, HTML);
  }
});

bot.command("logout", async (ctx) => {
  clearSession(chatId(ctx));
  aiHistory.delete(chatId(ctx));
  aiPending.delete(chatId(ctx));
  await ctx.reply("🔓 Unlinked. Send /pair to link again.");
});

bot.command("menu", async (ctx) => {
  await withToken(ctx, async (token) => sendScreen(ctx, await roomsScreen(token)));
});

bot.command("routines", async (ctx) => {
  await withToken(ctx, async (token) => sendScreen(ctx, await routinesScreen(token)));
});

// ── Inline-button callbacks ──────────────────────────────────────────────────

bot.on("callback_query:data", async (ctx) => {
  const action = lookup(ctx.callbackQuery.data);
  if (!action) {
    await ctx.answerCallbackQuery({ text: "This menu expired. Send /menu again." });
    return;
  }

  await withToken(ctx, async (token) => {
    switch (action.t) {
      case "rooms":
        await editScreen(ctx, await roomsScreen(token));
        break;
      case "room":
        await editScreen(ctx, await roomScreen(token, action.roomId));
        break;
      case "dev":
        await editScreen(ctx, await deviceScreen(token, action.deviceId));
        break;
      case "ctl":
        await editScreen(ctx, await controlScreen(token, action.deviceId, action.code));
        break;
      case "exec": {
        try {
          await api.sendCommand(token, action.deviceId, [{ code: action.code, value: action.value }]);
          await ctx.answerCallbackQuery({ text: "✅ Done" });
        } catch (e) {
          const err = e as ApiError;
          if (err instanceof ApiError && err.unauthorized) throw err;
          await ctx.answerCallbackQuery({ text: `⚠️ ${err.message}`, show_alert: true });
        }
        // Re-render the control screen so the new live state shows.
        await editScreen(ctx, await deviceScreen(token, action.deviceId));
        break;
      }
      case "routines":
        await editScreen(ctx, await routinesScreen(token));
        break;
      case "runrt": {
        const r = await api.runRoutine(token, action.routineId);
        await ctx.answerCallbackQuery({ text: summarizeExec(r), show_alert: true });
        break;
      }
      case "aiyes":
        await confirmAi(ctx, token);
        break;
      case "aino":
        aiPending.delete(chatId(ctx));
        await ctx.answerCallbackQuery({ text: "Cancelled." });
        await editScreen(ctx, { text: "❌ Cancelled.", keyboard: new InlineKeyboard() });
        break;
    }
  });

  // Always answer (no-op if already answered) so the client stops spinning.
  try {
    await ctx.answerCallbackQuery();
  } catch {
    /* already answered */
  }
});

// ── Natural language ─────────────────────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return; // unknown command — ignore
  await withToken(ctx, async (token) => {
    const id = chatId(ctx);
    const history = aiHistory.get(id) ?? [];
    history.push({ role: "user", content: text });

    await ctx.replyWithChatAction("typing");
    const res = await api.chat(token, history.slice(-8));
    history.push({ role: "assistant", content: res.reply });
    aiHistory.set(id, history.slice(-12));

    const hasWork = res.actions.length > 0 || res.routines.length > 0;
    if (!hasWork) {
      await ctx.reply(esc(res.reply), HTML);
      return;
    }

    aiPending.set(id, res);
    const lines = [esc(res.reply), "", "<b>I'll do:</b>"];
    for (const a of res.actions) {
      const lock = a.locked ? " 🔒(locked — will skip)" : "";
      lines.push(`• ${esc(a.deviceName)} › ${esc(a.controlName)} → ${esc(a.valueLabel)}${lock}`);
    }
    for (const rt of res.routines) {
      lines.push(`• ▶️ Run routine “${esc(rt.name)}” (${rt.actionCount} actions)`);
    }
    const kb = new InlineKeyboard()
      .text("✅ Confirm", register_aiyes())
      .text("❌ Cancel", register_aino());
    await ctx.reply(lines.join("\n"), { ...HTML, reply_markup: kb });
  });
});

// Small helpers to register the AI confirm/cancel callbacks.
function register_aiyes(): string {
  return register({ t: "aiyes" });
}
function register_aino(): string {
  return register({ t: "aino" });
}

async function confirmAi(ctx: Context, token: string): Promise<void> {
  const id = chatId(ctx);
  const pending = aiPending.get(id);
  aiPending.delete(id);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: "Nothing to confirm." });
    return;
  }
  await ctx.answerCallbackQuery({ text: "Working…" });

  const parts: string[] = [];
  if (pending.actions.length) {
    const r = await api.execute(token, pending.actions);
    parts.push(summarizeExec(r));
  }
  for (const rt of pending.routines) {
    try {
      const r = await api.runRoutine(token, rt.routineId);
      parts.push(`Routine “${rt.name}”: ${summarizeExec(r)}`);
    } catch (e) {
      parts.push(`Routine “${rt.name}”: ⚠️ ${(e as ApiError).message}`);
    }
  }
  await editScreen(ctx, { text: "✅ " + esc(parts.join("\n")), keyboard: new InlineKeyboard() });
}

function summarizeExec(r: api.ExecResult): string {
  const bits = [`${r.ok} done`];
  if (r.failed) bits.push(`${r.failed} failed`);
  if (r.ignoredLocked) bits.push(`${r.ignoredLocked} locked`);
  if (r.ignoredProtected) bits.push(`${r.ignoredProtected} protected`);
  return bits.join(", ");
}

// ── Boot ──────────────────────────────────────────────────────────────────────

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

await bot.api.setMyCommands([
  { command: "menu", description: "Browse rooms and switches" },
  { command: "routines", description: "Run a saved routine" },
  { command: "pair", description: "Link your account with a code" },
  { command: "logout", description: "Unlink this chat" },
  { command: "help", description: "How to use this bot" },
]);

console.log(`Chandrabindu Telegram bot starting (hub: ${config.baseUrl})…`);
bot.start({
  onStart: (info) => console.log(`Listening as @${info.username}`),
});
