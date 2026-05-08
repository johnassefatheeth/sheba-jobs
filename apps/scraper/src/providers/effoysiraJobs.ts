/**
 * EffoySira WordPress posts API provider.
 * Endpoint: https://effoysira.com/wp-json/wp/v2/posts
 */

const DEFAULT_BASE_URL = "https://effoysira.com/wp-json/wp/v2/posts";
const DEFAULT_DETAIL_TEMPLATE = "https://effoysira.com/{{slug}}/";

type EffoysiraPost = {
  id: number;
  date?: string | null;
  modified?: string | null;
  slug?: string | null;
  link?: string | null;
  title?: { rendered?: string | null } | null;
  content?: { rendered?: string | null } | null;
  excerpt?: { rendered?: string | null } | null;
  class_list?: string[] | null;
  yoast_head_json?: {
    articleSection?: string[] | null;
    description?: string | null;
  } | null;
};

export type EffoysiraMappedRow = {
  title: string;
  company: string | null;
  location: string | null;
  category: string | null;
  description: string;
  applyUrl: string | null;
  postedAt: Date | null;
  sourceUrl: string;
  rawSource: string | null;
};

export type FetchEffoysiraOptions = {
  baseUrl?: string;
  startPage?: number;
  pageSize?: number;
  maxJobs?: number;
  headers?: Record<string, string>;
};

function decodeHtml(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html: string): string {
  const withLineBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, "\n")
    .replace(/<\/ul>|<\/ol>|<\/table>/gi, "\n\n");

  const noTags = withLineBreaks.replace(/<[^>]+>/g, " ");
  return decodeHtml(noTags)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pickCategory(post: EffoysiraPost): string | null {
  const fromYoast = post.yoast_head_json?.articleSection?.[0]?.trim();
  if (fromYoast) return fromYoast;

  const classList = post.class_list ?? [];
  const categoryClass = classList.find((x) => x.startsWith("category-"));
  return categoryClass ? categoryClass.replace(/^category-/, "").replace(/-/g, " ") : null;
}

function inferLocation(text: string): string | null {
  const match = text.match(/\bLocation\s*[:\-]\s*([^\n.]{2,80})/i);
  return match?.[1]?.trim() || null;
}

function inferCompany(title: string): string | null {
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;

  const markers = [" vacancy", " jobs", " job vacancy", " fresh graduates"];
  const lower = cleanTitle.toLowerCase();
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx > 1) return cleanTitle.slice(0, idx).trim();
  }
  return null;
}

function inferApplyUrl(html: string, sourceUrl: string): string {
  const hrefs = Array.from(html.matchAll(/href="([^"]+)"/gi)).map((m) => m[1]);
  const preferred = hrefs.find((u) => /ethiojobs\.net|mailto:|forms\.gle|google\.com\/forms/i.test(u));
  return preferred || sourceUrl;
}

function mapPost(post: EffoysiraPost): EffoysiraMappedRow {
  const title = post.title?.rendered?.trim() || "Untitled";
  const contentHtml = post.content?.rendered ?? "";
  const excerptHtml = post.excerpt?.rendered ?? "";
  const description = htmlToText(contentHtml || excerptHtml);

  const sourceUrl =
    post.link?.trim() ||
    (post.slug?.trim() ? DEFAULT_DETAIL_TEMPLATE.replace(/\{\{slug\}\}/g, post.slug.trim()) : `effoysira:${post.id}`);

  return {
    title,
    company: inferCompany(title),
    location: inferLocation(description),
    category: pickCategory(post),
    description,
    applyUrl: inferApplyUrl(contentHtml, sourceUrl),
    postedAt: post.date ? new Date(post.date) : post.modified ? new Date(post.modified) : null,
    sourceUrl,
    rawSource: "wordpress",
  };
}

export async function fetchEffoysiraJobsMapped(
  options: FetchEffoysiraOptions = {}
): Promise<EffoysiraMappedRow[]> {
  const baseUrl = options.baseUrl ?? process.env.EFFOYSIRA_API_URL?.trim() ?? DEFAULT_BASE_URL;
  const startPage = options.startPage ?? Math.max(1, Number(process.env.EFFOYSIRA_START_PAGE ?? "1"));
  const pageSize = options.pageSize ?? Math.min(100, Math.max(1, Number(process.env.EFFOYSIRA_PAGE_SIZE ?? "20")));
  const maxJobs = options.maxJobs ?? Math.min(500, Math.max(1, Number(process.env.EFFOYSIRA_JOBS_LIMIT ?? "200")));

  let extraHeaders: Record<string, string> = {};
  if (process.env.EFFOYSIRA_API_HEADERS?.trim()) {
    try {
      extraHeaders = JSON.parse(process.env.EFFOYSIRA_API_HEADERS) as Record<string, string>;
    } catch {
      throw new Error("EFFOYSIRA_API_HEADERS must be valid JSON object");
    }
  }

  const all: EffoysiraMappedRow[] = [];
  let page = startPage;

  while (all.length < maxJobs) {
    const url = new URL(baseUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(pageSize));
    url.searchParams.set("status", "publish");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent":
          process.env.EFFOYSIRA_HTTP_USER_AGENT?.trim() ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        ...extraHeaders,
        ...options.headers,
      },
    });

    if (res.status === 400 || res.status === 404) break;

    const json = (await res.json()) as unknown;
    if (!res.ok) {
      throw new Error(`EffoySira HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
    }
    if (!Array.isArray(json)) {
      throw new Error("EffoySira API: expected array response");
    }
    if (json.length === 0) break;

    for (const item of json) {
      all.push(mapPost(item as EffoysiraPost));
      if (all.length >= maxJobs) break;
    }

    const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "0");
    if (totalPages > 0 && page >= totalPages) break;
    if (json.length < pageSize) break;
    page += 1;
  }

  return all;
}
