"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SCENE, STAGES } from "@/lib/scene-pack";

interface ProjectItem {
  id: number;
  name: string;
  target: string | null;
  current_stage: string;
  updated_at: string;
  artifactCount: number;
  doneStages: number;
}

const activeStageCount = STAGES.filter((s) => !s.coming).length;

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [ai, setAi] = useState({ calls: 0, limit: 100 });
  const [showCreate, setShowCreate] = useState(false);
  const [myProfile, setMyProfile] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects);
      setAi({ calls: data.aiCalls, limit: data.aiLimit });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ my_profile: myProfile, target }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      router.push(`/projects/${data.project.id}`);
    } else {
      setError(data.error ?? "创建失败");
    }
  }

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col gap-6">
      <header className="flex items-center gap-4 pt-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            <span className="text-accent">◆</span> BD Copilot
          </h1>
          <p className="text-sm text-muted mt-1">{SCENE.tagline}</p>
        </div>
        <span className="text-[11px] text-muted">今日 AI 用量 {ai.calls}/{ai.limit}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent text-black font-semibold text-sm rounded-xl px-5 py-2.5 hover:opacity-90 shadow-lg shadow-accent/20"
        >
          ＋ 新的合作目标
        </button>
      </header>

      {projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="text-center max-w-md">
            <p className="text-4xl mb-4">🤝</p>
            <h2 className="font-bold text-lg mb-2">你想和谁谈成一次合作？</h2>
            <p className="text-sm text-muted leading-relaxed">
              哪怕你从没做过 BD：告诉我目标对象，六位 AI 专员——背调、外联、策略、
              提案、谈判、合同——会带你一步步走完全程，每一步的产出自动接力给下一步。
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-6 bg-accent text-black font-semibold text-sm rounded-xl px-6 py-2.5 hover:opacity-90"
            >
              开始第一个项目
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((p) => {
            const stage = STAGES.find((s) => s.key === p.current_stage);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="bg-panel border border-line rounded-xl p-4 flex flex-col gap-2.5 hover:border-accent/60 transition-colors"
              >
                <h2 className="font-bold">{p.name}</h2>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="border border-accent/40 bg-accent/10 text-accent rounded px-1.5 py-0.5">
                    {stage?.agent?.emoji} 当前：{stage?.name}
                  </span>
                  <span>档案 {p.artifactCount} 份</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-panel2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-good rounded-full"
                      style={{ width: `${Math.round((p.doneStages / activeStageCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted">{p.doneStages}/{activeStageCount} 环节</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg bg-panel border border-line rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <h2 className="font-bold">新的合作目标 🤝</h2>
              <p className="text-xs text-muted mt-1">
                这两段话是全体专员的工作依据，写得越具体，他们干得越好。
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted font-semibold">我是谁 / 我的产品 / 我想通过合作得到什么</span>
              <textarea
                value={myProfile}
                onChange={(e) => setMyProfile(e.target.value)}
                rows={4}
                autoFocus
                placeholder="例如：我是一人公司，做面向宠物主的 AI 定制宠物写真小程序，月活 2 万。想找音乐平台合作，给写真配 AI 定制背景乐，提升客单价。"
                className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted font-semibold">目标对象（公司/机构名）</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="例如：Suno"
                className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent"
              />
            </label>
            {error && <p className="text-sm text-bad">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="text-sm text-muted hover:text-foreground px-3 py-2">
                取消
              </button>
              <button
                onClick={create}
                disabled={busy || myProfile.trim().length < 10 || !target.trim()}
                className="bg-accent text-black font-semibold text-sm rounded-lg px-5 py-2 disabled:opacity-40 hover:opacity-90"
              >
                {busy ? "创建中…" : "开始 →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
