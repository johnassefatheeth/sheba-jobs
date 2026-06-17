import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { API_BASE, COOKIE_NAME } from '../../../../lib/adminApi';

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({}));

  const response = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ error: payload.error || 'Login failed' }, { status: response.status });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, payload.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

export async function GET() {
  const token = cookies().get(COOKIE_NAME)?.value;
  return NextResponse.json({ authenticated: Boolean(token) });
}
