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
  type NavPlan,
  type Project,
  type ProjectStage,
  type ProjectStatus,
  type StageStatus,
  type TimelineEvent,
} from "@/lib/types";

const TIMELINE_ICON: Record<string, string> = {
  created: "🚀",
  briefing: "📝",
  stage_done: "✅",
  artifact: "📄",
  status: "🚦",
};

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  /** "" = 领航员视图；环节 key = 专员工作台 */
  const [selected, setSelected] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  /** 点了"需粘贴"型任务后挂起的任务 key，随下一条消息发出 */
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const [busyWebSearch, setBusyWebSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [viewArtifact, setViewArtifact] = useState<Artifact | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (stageKey?: string) => {
      const key = stageKey ?? selected;
      const res = await fetch(`/api/projects/${projectId}?stage=${key || "nav"}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
        setStages(data.stages);
        setArtifacts(data.artifacts);
        setTimeline(data.timeline ?? []);
        setMessages(data.messages);
      }
    },
    [projectId, selected]
  );

  useEffect(() => {
    load(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, selected]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const plan: NavPlan | null = project?.plan ? JSON.parse(project.plan) : null;
  const stageDef = getStage(selected);
  const stageState = stages.find((s) => s.stage_key === selected);
  const stageArtifacts = artifacts.filter((a) => a.stage_key === selected);
  const confirmedAll = artifacts.filter((a) => a.status === "confirmed");

  async function send(text: string, taskKey?: string) {
    if (!text.trim() || busy) return;
    const task = taskKey ?? pendingTask ?? undefined;
    setBusyWebSearch(!!getStage(selected)?.tasks?.find((t) => t.key === task)?.webSearch);
    setPendingTask(null);
    setBusy(true);
    setError("");
    setInput("");
    setMessages((m) => [
      ...m,
      { id: -1, project_id: projectId, stage_key: selected || "nav", role: "user", content: text, ts: "" },
    ]);
    let res: Response;
    if (!selected) {
      res = await fetch(`/api/projects/${projectId}/nav`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
    } else {
      if (stageState?.status === "pending") {
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: selected, status: "active" }),
        });
      }
      res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: selected, message: text, task }),
      });
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error ?? "出错了，请重试");
    await load(selected);
  }

  async function markDone() {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: selected, status: "done" as StageStatus }),
    });
    setSelected(""); // 完成后回到领航员
  }

  async function setProjectStatus(status: ProjectStatus) {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_status: status }),
    });
    await load(selected);
  }

  async function patchArtifact(id: number, body: Record<string, string>) {
    await fetch(`/api/artifacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load(selected);
  }

  if (!project) {
    return <main className="flex-1 flex items-center justify-center text-muted text-sm">加载中…</main>;
  }

  const navGreeting =
    messages.length === 0 && !selected
      ? plan
        ? "有什么新进展？跟对方聊完了、收到回复了、或者卡住了——都可以告诉我，我来调整计划。"
        : "我是领航员。点下面的按钮，我根据你的处境排一份专属计划。"
      : "";

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
          onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)}
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

      {/* 全程地图（按需展开）：生命周期是坐标系，不是主角 */}
      {showMap && (
        <div className="border-b border-line bg-panel/60 px-5 py-3 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {STAGES.map((s) => {
              const st = stages.find((x) => x.stage_key === s.key)?.status ?? "pending";
              const pi = plan?.items.find((p) => p.stage === s.key);
              const skipped = pi ? !pi.needed : false;
              return (
                <button
                  key={s.key}
                  disabled={!!s.coming}
                  onClick={() => { setSelected(s.key); setShowMap(false); }}
                  className={`text-left border rounded-xl px-3 py-2 transition-colors ${
                    s.coming
                      ? "border-line/40 text-muted/40 cursor-not-allowed"
                      : skipped
                        ? "border-line/60 text-muted/60 hover:border-line"
                        : st === "done"
                          ? "border-good/40 bg-good/5 hover:border-good/70"
                          : "border-line hover:border-accent/60"
                  }`}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    {st === "done" ? "✅" : s.agent?.emoji ?? "⏳"} {s.name}
                    {s.coming && <span className="text-[9px] font-normal">（V2）</span>}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5 leading-snug line-clamp-2">
                    {pi ? (pi.needed ? pi.reason || s.description : `本次不需要：${pi.reason}`) : s.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* 主区 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {!selected ? (
            /* ============ 领航员视图（默认主角） ============ */
            <>
              <div className="px-5 py-3 border-b border-line/60 flex items-start gap-3 shrink-0">
                <span className="text-2xl">🧭</span>
                <div className="flex-1">
                  <h2 className="font-bold text-sm">领航员</h2>
                  <p className="text-xs text-muted mt-0.5">
                    你的 BD 总调度——每次有新进展先告诉我，我来更新计划、带你去找对的专员
                  </p>
                </div>
              </div>

              {/* 现在该做的事 */}
              {plan && plan.next.length > 0 && (
                <div className="px-5 pt-4 shrink-0">
                  <p className="text-[11px] text-muted font-semibold mb-2">👉 现在该做的事</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {plan.next.map((n, i) => {
                      const s = getStage(n.stage);
                      return (
                        <button
                          key={i}
                          onClick={() => setSelected(n.stage)}
                          className="flex-1 text-left border border-accent/50 bg-accent/5 rounded-xl px-4 py-3 hover:bg-accent/15 transition-colors"
                        >
                          <div className="text-xs font-bold text-accent">
                            {s?.agent?.emoji} 找{s?.agent?.name} →
                          </div>
                          <div className="text-[12px] mt-1 leading-snug">{n.action}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                {navGreeting && (
                  <div className="bg-panel border border-line rounded-2xl px-4 py-2.5 text-sm max-w-[85%]">
                    {navGreeting}
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
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.role === "user" ? "bg-accent/15 border border-accent/30" : "bg-panel border border-line"
                      }`}
                    >
                      <div className="prose-sm prose-invert [&_p]:my-1.5 [&_ul]:my-1.5">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {busy && <div className="text-xs text-accent animate-pulse">🧭 领航员思考中…</div>}
                {error && <p className="text-xs text-bad">{error}</p>}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-line px-5 py-3 shrink-0">
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
                    rows={Math.min(5, Math.max(1, input.split("\n").length))}
                    placeholder="有什么新进展？（比如：聊完了，对方说预算不够但对内容合作有兴趣）"
                    className="flex-1 bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={busy || !input.trim()}
                    className="bg-accent text-black font-semibold text-sm rounded-xl px-5 py-3 disabled:opacity-40 hover:opacity-90"
                  >
                    发送
                  </button>
                </div>
              </div>
            </>
          ) : stageDef?.agent ? (
            /* ============ 专员工作台 ============ */
            <>
              <div className="px-5 py-3 border-b border-line/60 flex items-start gap-3 shrink-0">
                <button onClick={() => setSelected("")} className="text-muted hover:text-foreground text-sm mt-1">
                  🧭
                </button>
                <span className="text-2xl">{stageDef.agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm">{stageDef.agent.name}</h2>
                    <span className="text-[10px] text-muted">{stageDef.name}</span>
                    {stageState?.status !== "done" ? (
                      <button
                        onClick={markDone}
                        className="ml-auto text-[11px] border border-good/40 text-good rounded-lg px-2.5 py-1 hover:bg-good/10"
                      >
                        这步完成了 →
                      </button>
                    ) : (
                      <span className="ml-auto text-[11px] text-good">✅ 已完成</span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">{stageDef.agent.intro}</p>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                {messages.length === 0 && (
                  <p className="text-xs text-muted">
                    点下方任务芯片交付专项任务（每个任务有专属方法论），或直接输入自由交流。
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.role === "user" ? "bg-accent/15 border border-accent/30" : "bg-panel border border-line"
                      }`}
                    >
                      <div className="prose-sm prose-invert [&_p]:my-1.5 [&_ul]:my-1.5 [&_h2]:text-sm [&_h2]:font-bold">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="text-xs text-accent animate-pulse">
                    {stageDef.agent.emoji} {stageDef.agent.name}工作中…
                    {busyWebSearch ? "（含联网搜索，约 1-2 分钟）" : ""}
                  </div>
                )}
                {error && <p className="text-xs text-bad">{error}</p>}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-line px-5 py-3 shrink-0 flex flex-col gap-2">
                {/* 任务芯片：任务是一等公民，常驻可用 */}
                <div className="flex flex-wrap gap-1.5">
                  {(stageDef.tasks ?? []).map((t) => {
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
                    <button
                      onClick={() => { setPendingTask(null); setInput(""); }}
                      className="text-[11px] text-muted hover:text-foreground px-1.5"
                    >
                      取消任务 ✕
                    </button>
                  )}
                </div>
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
                        : `对${stageDef.agent.name}说…（Enter 发送）`
                    }
                    className="flex-1 bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={busy || !input.trim()}
                    className="bg-accent text-black font-semibold text-sm rounded-xl px-5 py-3 disabled:opacity-40 hover:opacity-90"
                  >
                    发送
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted text-sm">该环节即将上线（V2）</div>
          )}
        </div>

        {/* 右栏：时间线 + 档案 */}
        <aside className="w-80 min-h-0 border-l border-line bg-panel/40 overflow-y-auto p-4 flex flex-col gap-5 shrink-0 hidden lg:flex">
          {selected && (
            <div>
              <h3 className="text-xs text-muted font-semibold mb-2">本环节产出物（{stageArtifacts.length}）</h3>
              <div className="flex flex-col gap-2">
                {stageArtifacts.map((a) => (
                  <div key={a.id} className="bg-panel border border-line rounded-xl p-3 flex flex-col gap-2">
                    <button onClick={() => setViewArtifact(a)} className="text-left">
                      <div className="text-[13px] font-medium leading-snug hover:text-accent">📄 {a.title}</div>
                    </button>
                    {a.status === "confirmed" ? (
                      <span className="self-start text-[10px] border border-good/40 bg-good/10 text-good rounded px-1.5 py-0.5">✓ 已入档</span>
                    ) : (
                      <button
                        onClick={() => patchArtifact(a.id, { status: "confirmed" })}
                        className="self-start text-[10px] border border-accent/50 text-accent rounded px-2 py-0.5 hover:bg-accent/10"
                      >
                        确认入档 →
                      </button>
                    )}
                  </div>
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setViewArtifact(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-panel border border-line rounded-2xl flex flex-col">
            <div className="px-5 py-3 border-b border-line flex items-center gap-2 shrink-0">
              <h2 className="font-bold text-sm flex-1">📄 {viewArtifact.title}</h2>
              {viewArtifact.status === "draft" && (
                <button
                  onClick={async () => {
                    await patchArtifact(viewArtifact.id, { status: "confirmed" });
                    setViewArtifact(null);
                  }}
                  className="text-xs bg-accent text-black font-semibold rounded-lg px-3 py-1.5 hover:opacity-90"
                >
                  确认入档 →
                </button>
              )}
              <button
                onClick={async () => {
                  if (confirm("删除这份产出物？")) {
                    await fetch(`/api/artifacts/${viewArtifact.id}`, { method: "DELETE" });
                    setViewArtifact(null);
                    await load(selected);
                  }
                }}
                className="text-xs text-muted hover:text-bad px-2"
              >
                删除
              </button>
              <button onClick={() => setViewArtifact(null)} className="text-muted hover:text-foreground text-lg px-1">✕</button>
            </div>
            <div className="overflow-y-auto p-5 prose-sm prose-invert [&_h2]:text-base [&_h2]:font-bold [&_p]:my-2 [&_table]:text-xs">
              <ReactMarkdown>{viewArtifact.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
