import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE, COOKIE_NAME } from '../../../../lib/adminApi';

async function proxy(request: Request, path: string) {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = `${API_BASE}/admin/${path}${request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''}`;
  const init: RequestInit = {
    method: request.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const response = await fetch(url, init);
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
  });
}

type RouteContext = { params: { path: string[] } };

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context.params.path.join('/'));
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context.params.path.join('/'));
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxy(request, context.params.path.join('/'));
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context.params.path.join('/'));
}
