import type { AdminJob, AdminStats, ChannelPost, TelegramSubscriber } from './adminApi';

export type { AdminStats, ChannelPost, AdminJob, TelegramSubscriber } from './adminApi';

export type ChannelPostInput = {
  type: 'challenge' | 'news';
  title: string;
  body: string;
  buttonText?: string;
  buttonUrl?: string;
  imageUrl?: string;
};

export type PendingChannelPostImage = {
  data: string;
  mimeType: string;
  previewUrl: string;
};

async function proxyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function loginAdmin(password: string) {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Login failed');
}

export async function logoutAdmin() {
  await fetch('/api/admin/login', { method: 'DELETE' });
}

export function getAdminStats() {
  return proxyFetch<AdminStats>('stats');
}

export function getAdminJobs(params?: { search?: string; includeExpired?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.includeExpired) qs.set('includeExpired', 'true');
  const suffix = qs.toString() ? `?${qs}` : '';
  return proxyFetch<{ jobs: AdminJob[]; total: number }>(`jobs${suffix}`);
}

export function patchAdminJob(id: string, data: { isExpired: boolean }) {
  return proxyFetch<AdminJob>(`jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function removeAdminJob(id: string) {
  return proxyFetch(`jobs/${id}`, { method: 'DELETE' });
}

export function getChannelPosts() {
  return proxyFetch<{ posts: ChannelPost[] }>('posts');
}

export function getChannelPost(id: string) {
  return proxyFetch<ChannelPost>(`posts/${id}`);
}

export function createChannelPost(data: ChannelPostInput) {
  return proxyFetch<ChannelPost>('posts', { method: 'POST', body: JSON.stringify(data) });
}

export function updateChannelPost(id: string, data: Partial<ChannelPostInput>) {
  return proxyFetch<ChannelPost>(`posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function removeChannelPost(id: string) {
  return proxyFetch<{ ok: boolean }>(`posts/${id}`, { method: 'DELETE' });
}

export function publishChannelPostToTelegram(id: string) {
  return proxyFetch<ChannelPost>(`posts/${id}/publish`, { method: 'POST' });
}

export function uploadChannelPostImage(id: string, image: PendingChannelPostImage) {
  return proxyFetch<ChannelPost>(`posts/${id}/image`, {
    method: 'POST',
    body: JSON.stringify({ data: image.data, mimeType: image.mimeType }),
  });
}

export function removeChannelPostImage(id: string) {
  return proxyFetch<ChannelPost>(`posts/${id}/image`, { method: 'DELETE' });
}

export async function fileToPendingImage(file: File): Promise<PendingChannelPostImage> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP, or GIF image.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be 5 MB or smaller.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return {
    data: btoa(binary),
    mimeType: file.type,
    previewUrl: URL.createObjectURL(file),
  };
}

export function getSubscribers() {
  return proxyFetch<{ subscribers: TelegramSubscriber[] }>('subscribers');
}
