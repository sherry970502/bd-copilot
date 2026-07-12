"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("密码错误");
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm card-soft bg-panel border border-line rounded-2xl p-8 flex flex-col gap-5"
      >
        <div>
          <h1 className="text-xl font-bold">BD Copilot · AI 商务拓展团队</h1>
          <p className="text-sm text-muted mt-1">内部工具，请输入访问密码</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="访问密码"
          autoFocus
          className="bg-panel2 border border-line rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="bg-accent text-white font-semibold rounded-lg py-2 disabled:opacity-40 hover:opacity-90"
        >
          {loading ? "验证中…" : "进入看板"}
        </button>
      </form>
    </main>
  );
}
