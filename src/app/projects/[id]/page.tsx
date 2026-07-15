"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { STAGES, getStage } from "@/lib/scene-pack";
import {
  PROJECT_STATUS_LABELS,
  type Artifact,
  type ChatMessage,
  type Direction,
  type NavPlan,
  type Project,
  type ProjectStage,
  type ProjectStatus,
  type TimelineEvent,
  type Todo,
} from "@/lib/types";

function parseDirections(a: Artifact): Direction[] {
  try {
    const arr = JSON.parse(a.content);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 方向集卡片选择器：发散 → 用户勾选 → 交回领航员深化 */
function DirectionsPicker({
  artifact,
  busy,
  onDeepen,
}: {
  artifact: Artifact;
  busy: boolean;
  onDeepen: (text: string) => void;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState("");
  const dirs = parseDirections(artifact);
  if (dirs.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {dirs.map((d, i) => {
          const on = sel.has(i);
          return (
            <button
              key={i}
              onClick={() => {
                const next = new Set(sel);
                if (on) next.delete(i);
                else next.add(i);
                setSel(next);
              }}
              className={`text-left border rounded-xl px-3 py-2.5 transition-all ${
                on ? "border-accent bg-accent/10" : "border-line bg-panel2/60 hover:border-accent/50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-[13px] ${on ? "text-accent" : ""}`}>{on ? "☑" : "☐"}</span>
                <span className="text-[12px] font-bold flex-1">{d.title}</span>
                {d.recommended && (
                  <span className="text-[9px] border border-accent/40 bg-accent/10 text-accent rounded-full px-1.5 py-0.5">
                    推荐
                  </span>
                )}
              </div>
              <p className="text-[11px] text-foreground/80 mt-1 leading-snug">💡 {d.hook}</p>
              <p className="text-[10px] text-muted mt-1 leading-snug">给：{d.give}｜要：{d.get}</p>
              <p className="text-[10px] text-warn/90 mt-0.5 leading-snug">⚠ {d.risk}</p>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 items-end">
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="（可选）对选中方向的调整意见，如：方向二里别提分成"
          className="flex-1 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-accent"
        />
        <button
          disabled={busy || sel.size === 0}
          onClick={() => {
            const chosen = [...sel].map((i) => dirs[i].title);
            onDeepen(
              `我在「${artifact.title}」里选定了：${chosen.map((t) => `「${t}」`).join("、")}。${feedback.trim() ? `调整意见：${feedback.trim()}。` : ""}请安排深化：每个选定方向给出可执行的详细方案（怎么谈、拿什么说服对方、下一步动作）。`
            );
            setSel(new Set());
            setFeedback("");
          }}
          className="bg-accent text-white font-semibold text-[11px] rounded-lg px-3.5 py-1.5 disabled:opacity-40 hover:opacity-90 whitespace-nowrap"
        >
          深化选中（{sel.size}）→
        </button>
      </div>
    </div>
  );
}

const TIMELINE_ICON: Record<string, string> = {
  created: "🚀",
  briefing: "📝",
  stage_done: "✅",
  artifact: "📄",
  status: "🚦",
};

/** 群聊成员：领航员 + 六位专员（发言者标识） */
function speakerOf(stageKey: string): { emoji: string; name: string } {
  if (stageKey === "nav") return { emoji: "🧭", name: "领航员" };
  const a = getStage(stageKey)?.agent;
  return { emoji: a?.emoji ?? "🤖", name: a?.name ?? stageKey };
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** 当前对话对象：""=领航员，环节 key=对应专员（只影响输入框路由，不切房间） */
  const [activeAgent, setActiveAgent] = useState<string>("");
  const [input, setInput] = useState("");
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const [busyWebSearch, setBusyWebSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [viewArtifact, setViewArtifact] = useState<Artifact | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 切换项目时清空全部状态（防串台）
  useEffect(() => {
    setProject(null);
    setStages([]);
    setArtifacts([]);
    setTimeline([]);
    setTodos([]);
    setMessages([]);
    setActiveAgent("");
    setInput("");
    setPendingTask(null);
    setShowMap(false);
    setViewArtifact(null);
    setError("");
  }, [projectId]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data.project);
      setStages(data.stages);
      setArtifacts(data.artifacts);
      setTimeline(data.timeline ?? []);
      setTodos(data.todos ?? []);
      setMessages(data.messages ?? []);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const plan: NavPlan | null = project?.plan ? JSON.parse(project.plan) : null;
  const agentDef = activeAgent ? getStage(activeAgent) : null;
  const confirmedAll = artifacts.filter((a) => a.status === "confirmed");
  const draftArtifacts = artifacts.filter((a) => a.status === "draft");
  const pendingTodos = todos.filter((t) => t.status === "pending");
  const artifactById = new Map(artifacts.map((a) => [a.id, a]));

  async function send(text: string, taskKey?: string, forceNav = false) {
    if (!text.trim() || busy) return;
    const agent = forceNav ? "" : activeAgent;
    const task = taskKey ?? pendingTask ?? undefined;
    setBusyWebSearch(!!getStage(agent)?.tasks?.find((t) => t.key === task)?.webSearch);
    setPendingTask(null);
    setBusy(true);
    setError("");
    setInput("");
    setMessages((m) => [
      ...m,
      { id: -1, project_id: projectId, stage_key: agent || "nav", role: "user", content: text, artifact_id: null, ts: "" },
    ]);
    const res = agent
      ? await fetch(`/api/projects/${projectId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: agent, message: text, task }),
        })
      : await fetch(`/api/projects/${projectId}/nav`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error ?? "出错了，请重试");
    await load();
  }

  async function setProjStatus(status: ProjectStatus) {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_status: status }),
    });
    await load();
  }

  async function patchArtifact(id: number, body: Record<string, string>) {
    await fetch(`/api/artifacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function toggleTodo(t: Todo) {
    await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: t.status === "pending" ? "done" : "pending" }),
    });
    await load();
  }

  if (!project) {
    return <main className="flex items-center justify-center h-dvh text-muted text-sm">加载中…</main>;
  }

  return (
    <main className="flex flex-col h-dvh overflow-hidden">
      {/* 顶栏 */}
      <header className="border-b border-line bg-panel px-5 py-3 flex items-center gap-3 shrink-0">
        <Link href="/" className="text-muted hover:text-foreground text-sm">← 项目</Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[15px] truncate">{project.name}</h1>
        </div>
        <select
          value={project.status}
          onChange={(e) => setProjStatus(e.target.value as ProjectStatus)}
          className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-xs"
        >
          {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          onClick={() => setShowMap((v) => !v)}
          className={`text-xs border rounded-lg px-2.5 py-1.5 ${showMap ? "border-accent/60 text-accent bg-accent/10" : "border-line text-muted hover:text-foreground"}`}
        >
          🗺 全程地图
        </button>
      </header>

      {/* 全程地图：坐标系而非关卡——环节是可反复回访的工作区域 */}
      {showMap && (
        <div className="border-b border-line bg-panel/80 backdrop-blur px-5 py-3 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {STAGES.map((s) => {
              const pi = plan?.items.find((p) => p.stage === s.key);
              const skipped = pi ? !pi.needed : false;
              const focus = plan?.next.some((n) => n.stage === s.key) ?? false;
              const count = artifacts.filter((a) => a.stage_key === s.key).length;
              const badge = s.coming
                ? { text: "V2 即将上线", cls: "text-muted bg-panel2 border-line" }
                : focus
                  ? { text: "本轮聚焦", cls: "text-accent bg-accent/10 border-accent/30" }
                  : skipped
                    ? { text: "暂不需要", cls: "text-muted bg-panel2 border-line" }
                    : { text: "待命", cls: "text-muted bg-panel2 border-line" };
              return (
                <button
                  key={s.key}
                  disabled={!!s.coming}
                  onClick={() => { setActiveAgent(s.key); setShowMap(false); }}
                  className={`text-left border rounded-xl px-3 py-2.5 transition-all ${
                    s.coming
                      ? "border-dashed border-line bg-panel2/60 cursor-not-allowed"
                      : skipped
                        ? "border-dashed border-line bg-panel2/60 hover:border-muted/50"
                        : "card-soft bg-panel border-line hover:border-accent/60 hover:-translate-y-0.5"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm ${s.coming || skipped ? "grayscale opacity-70" : ""}`}>
                      {s.agent?.emoji ?? "🔭"}
                    </span>
                    <span className={`text-xs font-bold ${s.coming || skipped ? "text-muted" : "text-foreground"}`}>
                      {s.name}
                    </span>
                    <span className={`ml-auto text-[9px] border rounded-full px-1.5 py-0.5 whitespace-nowrap ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted mt-1 leading-snug line-clamp-2">
                    {pi ? pi.reason || s.description : s.description}
                  </div>
                  {count > 0 && (
                    <div className="text-[9px] text-accent mt-1">📄 已有产出 {count} 份</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* ============ 主区：项目群聊（统一消息流） ============ */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* 现在该做的事 */}
          {plan && plan.next.length > 0 && (
            <div className="px-5 pt-3 pb-1 shrink-0 flex flex-wrap gap-2 items-center">
              <span className="text-[11px] text-muted font-semibold">👉 现在：</span>
              {plan.next.map((n, i) => {
                const s = getStage(n.stage);
                return (
                  <button
                    key={i}
                    onClick={() => setActiveAgent(n.stage)}
                    className="text-left border border-accent/40 bg-accent/5 rounded-xl px-3 py-1.5 hover:bg-accent/15 transition-colors"
                  >
                    <span className="text-[11px] font-bold text-accent">{s?.agent?.emoji} {n.action}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 统一消息流 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {messages.length === 0 && (
              <div className="card-soft bg-panel border border-line rounded-2xl px-4 py-3 text-sm max-w-[85%] flex gap-2">
                <span>🧭</span>
                <span>
                  {plan
                    ? "有什么新进展？跟对方聊完了、收到回复了、或者卡住了——都可以告诉我。"
                    : "我是领航员。点下面的按钮，我根据你的处境排一份专属计划。"}
                </span>
              </div>
            )}
            {!plan && messages.length === 0 && (
              <button
                disabled={busy}
                onClick={() => send(project.situation ?? "帮我排个计划")}
                className="self-start border border-accent/50 text-accent rounded-xl px-5 py-2.5 text-sm hover:bg-accent/10 disabled:opacity-40"
              >
                🧭 让领航员排计划 →
              </button>
            )}
            {messages.map((m, i) => {
              const sp = speakerOf(m.stage_key);
              const art = m.artifact_id ? artifactById.get(m.artifact_id) : null;
              return m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-accent/15 border border-accent/30">
                    <div className="prose-sm [&_p]:my-1.5"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-2.5 max-w-[85%]">
                  <span className="text-xl shrink-0 mt-1">{sp.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted mb-1">{sp.name}</div>
                    <div className="card-soft bg-panel border border-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed">
                      <div className="prose-sm [&_p]:my-1.5 [&_ul]:my-1.5 [&_h2]:text-sm [&_h2]:font-bold">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                      {art && art.kind === "directions" ? (
                        <DirectionsPicker
                          artifact={art}
                          busy={busy}
                          onDeepen={(text) => {
                            setActiveAgent("");
                            send(text, undefined, true);
                          }}
                        />
                      ) : art ? (
                        <button
                          onClick={() => setViewArtifact(art)}
                          className="mt-2 w-full text-left border border-accent/30 bg-accent/5 rounded-xl px-3 py-2.5 hover:bg-accent/10 transition-colors"
                        >
                          <div className="text-[13px] font-bold text-accent">📄 {art.title}</div>
                          <div className="text-[10px] text-muted mt-0.5">
                            {art.status === "confirmed" ? "✓ 已入档" : "草稿——点开查看，确认后入档供全员使用"}
                          </div>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="text-xs text-accent animate-pulse flex items-center gap-1.5">
                {activeAgent
                  ? `${agentDef?.agent?.emoji} ${agentDef?.agent?.name}工作中…`
                  : "🧭 领航员调度中…（如需要会当场派单给专员接着交活，可能 1-2 分钟）"}
                {busyWebSearch ? "（含联网搜索，约 1-2 分钟）" : ""}
              </div>
            )}
            {error && <p className="text-xs text-bad">{error}</p>}
            <div ref={chatEndRef} />
          </div>

          {/* 底部：对话对象选择 + 任务芯片 + 输入 */}
          <div className="border-t border-line bg-panel/70 backdrop-blur px-5 py-3 shrink-0 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5 items-center">
              <button
                onClick={() => { setActiveAgent(""); setPendingTask(null); }}
                className={`text-[11px] border rounded-lg px-2.5 py-1 ${activeAgent === "" ? "border-accent bg-accent text-white font-bold" : "border-line text-muted hover:text-foreground"}`}
              >
                🧭 领航员
              </button>
              <span className="text-[10px] text-muted/60">｜直接点名：</span>
              {STAGES.filter((s) => !s.coming && s.agent).map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setActiveAgent(s.key); setPendingTask(null); }}
                  className={`text-[11px] border rounded-lg px-2 py-1 ${activeAgent === s.key ? "border-accent bg-accent text-white font-bold" : "border-line/70 text-muted/80 hover:text-foreground"}`}
                  title={s.agent!.intro}
                >
                  {s.agent!.emoji} {activeAgent === s.key ? s.agent!.name : ""}
                </button>
              ))}
              {activeAgent && (
                <span className="text-[10px] text-muted ml-1">
                  正在直接对话{agentDef?.agent?.name}（跳过领航员调度）
                </span>
              )}
            </div>
            {agentDef?.tasks && (
              <div className="flex flex-wrap gap-1.5">
                {agentDef.tasks.map((t) => {
                  const needsPaste = t.prompt.includes("贴在这里");
                  return (
                    <button
                      key={t.key}
                      disabled={busy}
                      onClick={() => {
                        if (needsPaste) {
                          setInput(t.prompt);
                          setPendingTask(t.key);
                        } else {
                          send(t.prompt, t.key);
                        }
                      }}
                      className={`text-[11px] border rounded-lg px-2.5 py-1 disabled:opacity-40 ${
                        pendingTask === t.key
                          ? "border-accent text-accent bg-accent/15 font-bold"
                          : "border-accent/40 text-accent hover:bg-accent/10"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
                {pendingTask && (
                  <button onClick={() => { setPendingTask(null); setInput(""); }} className="text-[11px] text-muted hover:text-foreground px-1.5">
                    取消任务 ✕
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={Math.min(6, Math.max(1, input.split("\n").length))}
                placeholder={
                  pendingTask
                    ? "把材料粘贴进来后发送，专员按该任务的方法论处理"
                    : activeAgent
                      ? `对${agentDef?.agent?.name}说…（Enter 发送）`
                      : "有什么新进展？告诉领航员…（Enter 发送）"
                }
                className="flex-1 bg-panel border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
              />
              <button
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                className="bg-accent text-white font-semibold text-sm rounded-xl px-5 py-3 disabled:opacity-40 hover:opacity-90"
              >
                发送
              </button>
            </div>
          </div>
        </div>

        {/* ============ 右栏：人类待办 + 时间线 + 档案 ============ */}
        <aside className="w-80 min-h-0 border-l border-line bg-panel/40 overflow-y-auto p-4 flex flex-col gap-5 shrink-0 hidden lg:flex">
          {(pendingTodos.length > 0 || draftArtifacts.length > 0) && (
            <div>
              <h3 className="text-xs font-bold mb-2 text-foreground">
                👤 人类待办（{pendingTodos.length + draftArtifacts.length}）
              </h3>
              <div className="flex flex-col gap-1.5">
                {draftArtifacts.map((a) => (
                  <div key={`d${a.id}`} className="card-soft bg-panel border border-warn/40 rounded-xl px-3 py-2.5">
                    <button onClick={() => setViewArtifact(a)} className="text-left w-full">
                      <div className="text-[12px] font-medium leading-snug">📄 {a.title}</div>
                      <div className="text-[10px] text-warn mt-0.5">待审阅——确认后入档供全员使用</div>
                    </button>
                    <div className="flex gap-1.5 mt-1.5">
                      <button
                        onClick={() => patchArtifact(a.id, { status: "confirmed" })}
                        className="text-[10px] border border-good/50 text-good rounded px-2 py-0.5 hover:bg-good/10"
                      >
                        ✓ 确认入档
                      </button>
                      <button onClick={() => setViewArtifact(a)} className="text-[10px] text-muted hover:text-foreground">
                        先看看
                      </button>
                    </div>
                  </div>
                ))}
                {pendingTodos.map((t) => (
                  <label key={t.id} className="card-soft bg-panel border border-line rounded-xl px-3 py-2.5 flex items-start gap-2 cursor-pointer hover:border-accent/50">
                    <input type="checkbox" checked={false} onChange={() => toggleTodo(t)} className="mt-0.5 accent-[#6d5cf5]" />
                    <span className="text-[12px] leading-snug">{t.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs text-muted font-semibold mb-2">项目时间线</h3>
            <div className="flex flex-col gap-2">
              {timeline.map((t) => (
                <div key={t.id} className="flex gap-2 text-[11px] leading-relaxed">
                  <span className="shrink-0">{TIMELINE_ICON[t.kind] ?? "·"}</span>
                  <div className="min-w-0">
                    <p className="text-foreground/85">{t.text}</p>
                    <p className="text-muted/60 text-[10px]">{t.ts.slice(5, 16).replace("T", " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <h3 className="text-xs text-muted font-semibold mb-2">项目档案（{confirmedAll.length}）</h3>
            <div className="flex flex-col gap-1">
              {confirmedAll.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setViewArtifact(a)}
                  className="text-left text-[11px] text-muted hover:text-foreground truncate"
                >
                  {getStage(a.stage_key)?.agent?.emoji ?? "📝"} {a.title}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* 产出物查看 */}
      {viewArtifact && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setViewArtifact(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] card-soft bg-panel border border-line rounded-2xl flex flex-col">
            <div className="px-5 py-3 border-b border-line flex items-center gap-2 shrink-0">
              <h2 className="font-bold text-sm flex-1">📄 {viewArtifact.title}</h2>
              {viewArtifact.status === "draft" && (
                <button
                  onClick={async () => {
                    await patchArtifact(viewArtifact.id, { status: "confirmed" });
                    setViewArtifact(null);
                  }}
                  className="text-xs bg-accent text-white font-semibold rounded-lg px-3 py-1.5 hover:opacity-90"
                >
                  确认入档 →
                </button>
              )}
              <button
                onClick={async () => {
                  if (confirm("删除这份产出物？")) {
                    await fetch(`/api/artifacts/${viewArtifact.id}`, { method: "DELETE" });
                    setViewArtifact(null);
                    await load();
                  }
                }}
                className="text-xs text-muted hover:text-bad px-2"
              >
                删除
              </button>
              <button onClick={() => setViewArtifact(null)} className="text-muted hover:text-foreground text-lg px-1">✕</button>
            </div>
            <div className="overflow-y-auto p-5 prose-sm [&_h2]:text-base [&_h2]:font-bold [&_p]:my-2 [&_table]:text-xs">
              {viewArtifact.kind === "directions" ? (
                <div className="flex flex-col gap-2 not-prose">
                  {parseDirections(viewArtifact).map((d, i) => (
                    <div key={i} className="border border-line rounded-xl px-3 py-2.5 bg-panel2/60">
                      <div className="text-[13px] font-bold">
                        {d.title}
                        {d.recommended && <span className="ml-2 text-[9px] border border-accent/40 bg-accent/10 text-accent rounded-full px-1.5 py-0.5">推荐</span>}
                      </div>
                      <p className="text-[11px] mt-1">💡 {d.hook}</p>
                      <p className="text-[10px] text-muted mt-1">给：{d.give}｜要：{d.get}</p>
                      <p className="text-[10px] text-warn/90 mt-0.5">⚠ {d.risk}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <ReactMarkdown>{viewArtifact.content}</ReactMarkdown>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
