import { NextResponse } from "next/server";
import { updateArtifact, deleteArtifact } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: "draft" | "confirmed";
    content?: string;
    title?: string;
  };
  const artifact = updateArtifact(Number(id), body);
  if (!artifact) return NextResponse.json({ error: "产出物不存在" }, { status: 404 });
  return NextResponse.json({ artifact });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  deleteArtifact(Number(id));
  return NextResponse.json({ ok: true });
}
