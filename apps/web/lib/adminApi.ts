const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const COOKIE_NAME = 'sheba_admin_token';

export { API_BASE, COOKIE_NAME };

export type AdminStats = {
  jobs: { total: number; active: number; expired: number; postedToday: number; telegramPosted: number };
  subscribers: { total: number; active: number };
  channelPosts: { total: number; published: number; drafts: number };
  telegram: { configured: boolean };
  admin: { enabled: boolean };
};

export type ChannelPost = {
  id: string;
  type: 'challenge' | 'news';
  title: string;
  body: string;
  buttonText?: string | null;
  buttonUrl?: string | null;
  imageUrl?: string | null;
  imagePath?: string | null;
  imagePreviewUrl?: string | null;
  status: 'draft' | 'published';
  telegramPostedAt?: string | null;
  telegramMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminJob = {
  id: string;
  slug?: string | null;
  title: string;
  company?: string | null;
  category?: string | null;
  isExpired: boolean;
  postedAt?: string | null;
  telegramPostedAt?: string | null;
  scrapedFrom?: string | null;
  createdAt: string;
};

export type TelegramSubscriber = {
  id: string;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  isActive: boolean;
  receiveAll: boolean;
  categories: string[];
  createdAt: string;
  updatedAt: string;
  _count: { deliveries: number };
};

async function adminFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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

export async function fetchAdminStats(token: string) {
  return adminFetch<AdminStats>('/stats', token);
}

export async function fetchAdminJobs(token: string, params?: { search?: string; includeExpired?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.includeExpired) qs.set('includeExpired', 'true');
  const suffix = qs.toString() ? `?${qs}` : '';
  return adminFetch<{ jobs: AdminJob[]; total: number }>(`/jobs${suffix}`, token);
}

export async function updateAdminJob(token: string, id: string, data: { isExpired: boolean }) {
  return adminFetch<AdminJob>(`/jobs/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteAdminJob(token: string, id: string) {
  return adminFetch<{ ok: boolean }>(`/jobs/${id}`, token, { method: 'DELETE' });
}

export async function fetchChannelPosts(token: string) {
  return adminFetch<{ posts: ChannelPost[] }>('/posts', token);
}

export async function fetchChannelPost(token: string, id: string) {
  return adminFetch<ChannelPost>(`/posts/${id}`, token);
}

export async function createChannelPost(
  token: string,
  data: Pick<ChannelPost, 'type' | 'title' | 'body'> & { buttonText?: string; buttonUrl?: string }
) {
  return adminFetch<ChannelPost>('/posts', token, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateChannelPost(
  token: string,
  id: string,
  data: Partial<Pick<ChannelPost, 'type' | 'title' | 'body' | 'buttonText' | 'buttonUrl'>>
) {
  return adminFetch<ChannelPost>(`/posts/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteChannelPost(token: string, id: string) {
  return adminFetch<{ ok: boolean }>(`/posts/${id}`, token, { method: 'DELETE' });
}

export async function publishChannelPost(token: string, id: string) {
  return adminFetch<ChannelPost>(`/posts/${id}/publish`, token, { method: 'POST' });
}

export async function fetchSubscribers(token: string) {
  return adminFetch<{ subscribers: TelegramSubscriber[] }>('/subscribers', token);
}
