// Shared OpenRouter chat helper used by Insights and the Assistant. Centralizes
// the SDK call, transient-error retry, and error-message extraction.

import { OpenRouter } from "@openrouter/sdk";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Send a chat completion to OpenRouter and return the text content.
 * Retries once on transient provider errors; throws a readable Error otherwise.
 */
export async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; jsonObject?: boolean } = {},
): Promise<string> {
  const client = new OpenRouter({ apiKey });
  const chatRequest: any = {
    model,
    messages,
    stream: false,
    maxTokens: opts.maxTokens ?? 1200,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.jsonObject) chatRequest.responseFormat = { type: "json_object" };

  let result: any;
  for (let attempt = 0; ; attempt++) {
    try {
      result = await client.chat.send({ chatRequest } as any);
      break;
    } catch (err) {
      const e = err as any;
      const status: number | undefined = e?.statusCode;
      if (attempt < 1 && [429, 500, 502, 503].includes(status ?? 0)) {
        await new Promise((r) => setTimeout(r, 1800));
        continue;
      }
      let detail = e?.message || "request failed";
      if (typeof e?.body === "string" && e.body) {
        try {
          const parsed = JSON.parse(e.body);
          detail = parsed?.error?.message || e.body;
        } catch {
          detail = e.body;
        }
      }
      throw new Error(
        `OpenRouter${status ? ` (${status})` : ""}: ${detail}. The model may be overloaded — try again or pick another in Settings.`,
      );
    }
  }

  let content = result?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    content = content.map((c: any) => c?.text ?? c?.content ?? "").join("");
  }
  return typeof content === "string" ? content.trim() : "";
}

/** Best-effort extraction of a JSON object from a model response. */
export function extractJson(raw: string): any | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (!s.startsWith("{")) {
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
