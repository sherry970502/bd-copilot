import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ profile: getProfile() ?? null });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const content = body.content?.trim();
  if (!content || content.length < 20) {
    return NextResponse.json(
      { error: "档案至少写几句话——它是全体专员的工作依据" },
      { status: 400 }
    );
  }
  return NextResponse.json({ profile: saveProfile(content) });
}
