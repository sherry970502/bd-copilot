import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { runNavigator } from "@/lib/ai/navigator";

export const dynamic = "force-dynamic";

/** 领航员对话：{message}。消耗 1 次 AI 调用 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const project = getProject(Number(id));
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "说点什么吧" }, { status: 400 });
  }
  try {
    const reply = await runNavigator(project, body.message.trim());
    return NextResponse.json(reply);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "领航员开小差了，请重试" },
      { status: 500 }
    );
  }
}
