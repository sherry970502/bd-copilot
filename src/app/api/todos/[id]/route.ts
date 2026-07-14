import { NextResponse } from "next/server";
import { setTodoStatus } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { status?: "pending" | "done" };
  if (body.status !== "pending" && body.status !== "done") {
    return NextResponse.json({ error: "无效状态" }, { status: 400 });
  }
  setTodoStatus(Number(id), body.status);
  return NextResponse.json({ ok: true });
}
