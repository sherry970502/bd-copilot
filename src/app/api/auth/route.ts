import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.ACCESS_PASSWORD;
  if (!expected || !body.password || body.password !== expected) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const store = await cookies();
  store.set(AUTH_COOKIE, await authToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
