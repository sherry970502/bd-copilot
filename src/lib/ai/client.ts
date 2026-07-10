import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db";
import { appFetch } from "../http";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    // API key 从环境变量 ANTHROPIC_API_KEY 读取；fetch 走统一出站入口（支持代理）
    client = new Anthropic({ fetch: appFetch });
  }
  return client;
}

export const AGENT_MODEL = process.env.BDC_MODEL || "claude-sonnet-5";

type StreamParams = Parameters<Anthropic["messages"]["stream"]>[0];

/** 带服务端工具（web_search）的流式调用；pause_turn 自动续跑 */
export async function streamWithServerTools(
  params: StreamParams
): Promise<Anthropic.Message> {
  let messages = [...params.messages];
  for (let i = 0; i < 6; i++) {
    const stream = getAnthropic().messages.stream({ ...params, messages });
    const message = await stream.finalMessage();
    if (message.stop_reason !== "pause_turn") {
      return message;
    }
    messages = [
      ...messages,
      {
        role: "assistant",
        content: message.content as unknown as Anthropic.ContentBlockParam[],
      },
    ];
  }
  throw new Error("服务端工具循环续跑超过 6 次仍未结束");
}

export function messageText(message: Anthropic.Message): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export class BudgetExceededError extends Error {
  constructor(limit: number) {
    super(`今日 AI 调用已达上限（${limit} 次）。明天再来，或联系管理员调高上限。`);
    this.name = "BudgetExceededError";
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTodayAiCalls(): number {
  const row = getDb()
    .prepare("SELECT calls FROM ai_usage WHERE day = ?")
    .get(todayKey()) as { calls: number } | undefined;
  return row?.calls ?? 0;
}

export function dailyLimit(): number {
  return Number(process.env.BDC_DAILY_AI_LIMIT || 100);
}

export function assertBudget(): void {
  const limit = dailyLimit();
  if (getTodayAiCalls() >= limit) {
    throw new BudgetExceededError(limit);
  }
}

export function recordAiCall(): void {
  getDb()
    .prepare(
      "INSERT INTO ai_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1"
    )
    .run(todayKey());
}
