import { getDb, now, addTimeline, trackEvent } from "../db";
import {
  AGENT_MODEL,
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "./client";
import { STAGES, getStage } from "../scene-pack";
import { getProfile } from "../profile";
import { buildHistory } from "./agent";
import type { NavPlan, Project, ProjectStatus, Artifact } from "../types";

/**
 * 领航员：项目的常驻接待台。用户每次带着新进展回来，领航员做三件事：
 * 1. 把口述进展提炼成纪要入档（成为全体专员共享的事实）
 * 2. 重排活计划（哪些环节本次需要/跳过，计划跟着现实走）
 * 3. 移交：给出「现在该做的 1-2 件事」，直达对应专员
 * 生命周期只是它内部的调度坐标系，用户感知到的是"它总知道下一步"。
 */

const NAV_SYSTEM_BASE = `你是「领航员」——用户的 BD 项目总调度。用户是没有商务拓展经验的个人或小团队，他会用大白话告诉你最新进展或想法，你负责判断局面、更新计划、指路。

你手下有这些环节与专员（这是你的调度坐标系，不要向用户罗列）：
{STAGE_LIST}

工作原则：
- **结果导向**：用户要的是"这件事办成"，不是走完流程。哪些环节本次需要、哪些跳过，完全由他的处境决定；计划赶不上变化，每次进展都重新判断
- **敢说真话**：局面明显没戏时，坦率建议搁置并说明判断依据——诚实比假装有戏值钱。对方长时间未回复可建议标记"等待对方"并给出唤醒策略
- 回复口吻像一位靠谱的老 BD 带新人：先接住他说的事（一两句），然后直接说现在该干嘛。短，不啰嗦，不写长篇分析
- 用户闲聊或提问时正常回答，不必每次都动计划

**机器可读块**：每次回复的最后，另起一行输出（用户看不到，不算回复正文）：
<nav>{"summary":"若用户带来了新的事实性进展，用 50 字内提炼成纪要，否则 null","plan":[{"stage":"环节key","needed":true或false,"reason":"一句话理由"}],"next":[{"stage":"环节key","action":"具体要做的事，一句话"}],"todos":["只有人能做的事（发出邮件/赴约/内部拍板/等对方答复），0-3 条，AI 能干的绝不放进来"],"status":"active|waiting|won|shelved 或 null（仅在建议变更项目状态时给值）"}</nav>
- plan 必须包含全部可用环节（{STAGE_KEYS}）；next 给 1-2 项，stage 必须取自可用环节
- todos 是「人类待办区」：判断标准是"这件事 AI 无法代劳"——需要用户去真实世界执行或拍板的才列，且不与已有待办重复
- JSON 必须语法合法，字符串内不要用未转义英文双引号`;

function stageList(): string {
  return STAGES.filter((s) => !s.coming)
    .map(
      (s) =>
        `- ${s.key}（${s.name}）：${s.description}——专员：${s.agent?.name}，可交付任务：${(s.tasks ?? []).map((t) => t.label).join("、")}`
    )
    .join("\n");
}

function buildNavContext(project: Project): string {
  const db = getDb();
  const profile = getProfile();
  const confirmed = db
    .prepare(
      "SELECT stage_key, title, content FROM artifacts WHERE project_id = ? AND status = 'confirmed' ORDER BY id ASC"
    )
    .all(project.id) as Pick<Artifact, "stage_key" | "title" | "content">[];
  const archive = confirmed
    .map((a) => `【${getStage(a.stage_key)?.name ?? "纪要"}｜${a.title}】\n${a.content.slice(0, 1500)}`)
    .join("\n\n---\n\n");
  const timeline = (
    getDb()
      .prepare("SELECT kind, text, ts FROM timeline WHERE project_id = ? ORDER BY id DESC LIMIT 10")
      .all(project.id) as { kind: string; text: string; ts: string }[]
  )
    .reverse()
    .map((t) => `${t.ts.slice(0, 10)} ${t.text}`)
    .join("\n");

  return `—— 项目档案 ——
我方（工作区档案）：
${profile?.content ?? "（用户尚未建档）"}

目标对象：${project.target ?? "未明确"}
建项目时用户描述的处境与目标：
${project.situation ?? "（无）"}

项目时间线（近 10 条）：
${timeline || "（刚创建）"}

已入档产出物与纪要：
${archive || "（暂无）"}`;
}

export interface NavReply {
  text: string;
  plan: NavPlan | null;
  status: ProjectStatus | null;
}

export async function runNavigator(project: Project, userMessage: string): Promise<NavReply> {
  const db = getDb();
  db.prepare(
    "INSERT INTO messages (project_id, stage_key, role, content, ts) VALUES (?, 'nav', 'user', ?, ?)"
  ).run(project.id, userMessage, now());

  const history = buildHistory(project.id);

  const availableKeys = STAGES.filter((s) => !s.coming).map((s) => s.key);
  const system =
    NAV_SYSTEM_BASE.replace("{STAGE_LIST}", stageList()).replace(
      "{STAGE_KEYS}",
      availableKeys.join(" / ")
    ) + `\n\n${buildNavContext(project)}`;

  assertBudget();
  recordAiCall();
  trackEvent("nav_call", null as unknown as string, project.id, "nav");

  const message = await streamWithServerTools({
    model: AGENT_MODEL,
    max_tokens: 4000,
    system,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  const raw = messageText(message).replace(/^【[^】]{1,12}】\s*/, "");
  if (!raw.trim()) throw new Error("领航员没有返回内容");

  // 解析机器块
  let plan: NavPlan | null = null;
  let status: ProjectStatus | null = null;
  let display = raw;
  const m = raw.match(/<nav>([\s\S]*?)<\/nav>/);
  if (m) {
    display = raw.replace(m[0], "").trim();
    try {
      const parsed = JSON.parse(m[1]) as {
        summary?: string | null;
        plan?: { stage?: string; needed?: boolean; reason?: string }[];
        next?: { stage?: string; action?: string }[];
        todos?: string[];
        status?: string | null;
      };
      // 人类待办：只收 AI 无法代劳的事，与未完成待办去重
      if (Array.isArray(parsed.todos)) {
        const existing = new Set(
          (db
            .prepare("SELECT text FROM todos WHERE project_id = ? AND status = 'pending'")
            .all(project.id) as { text: string }[]).map((t) => t.text)
        );
        for (const t of parsed.todos.slice(0, 3)) {
          if (t && t.trim() && !existing.has(t.trim())) {
            db.prepare(
              "INSERT INTO todos (project_id, text, status, source, created_at) VALUES (?, ?, 'pending', 'nav', ?)"
            ).run(project.id, t.trim(), now());
          }
        }
      }
      // 进展纪要 → 自动入档（confirmed，成为全员共享事实）+ 时间线
      if (parsed.summary && parsed.summary.trim()) {
        const ts = now();
        db.prepare(
          "INSERT INTO artifacts (project_id, stage_key, title, content, status, created_at, updated_at) VALUES (?, 'nav', ?, ?, 'confirmed', ?, ?)"
        ).run(project.id, `进展纪要 · ${ts.slice(5, 10)}`, parsed.summary.trim(), ts, ts);
        addTimeline(project.id, "briefing", parsed.summary.trim());
      }
      const items = (parsed.plan ?? [])
        .filter((p) => p.stage && availableKeys.includes(p.stage))
        .map((p) => ({ stage: p.stage!, needed: p.needed !== false, reason: p.reason ?? "" }));
      const next = (parsed.next ?? [])
        .filter((n) => n.stage && availableKeys.includes(n.stage) && n.action)
        .slice(0, 2)
        .map((n) => ({ stage: n.stage!, action: n.action! }));
      if (items.length > 0 || next.length > 0) {
        plan = { items, next, updated_at: now() };
        db.prepare("UPDATE projects SET plan = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(plan),
          now(),
          project.id
        );
      }
      if (
        parsed.status &&
        ["active", "waiting", "won", "shelved"].includes(parsed.status) &&
        parsed.status !== project.status
      ) {
        status = parsed.status as ProjectStatus;
        db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?").run(
          status,
          now(),
          project.id
        );
        addTimeline(project.id, "status", `领航员将项目状态调整为「${status}」`);
      }
    } catch {
      // 机器块解析失败不影响正文回复
    }
  }

  db.prepare(
    "INSERT INTO messages (project_id, stage_key, role, content, ts) VALUES (?, 'nav', 'assistant', ?, ?)"
  ).run(project.id, display, now());
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), project.id);

  return { text: display, plan, status };
}
