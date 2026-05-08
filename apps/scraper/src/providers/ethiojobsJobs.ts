/**
 * Ethiojobs public API provider.
 * Endpoint example:
 * https://api.ethiojobs.net/ethiojobs/api/job-board/jobs?featured=undefined&page=1&limit=10&
 */

const DEFAULT_BASE_URL = "https://api.ethiojobs.net/ethiojobs/api/job-board/jobs";

type EthiojobsJob = {
  id: string;
  title: string;
  slug?: string | null;
  date_published?: string | null;
  description?: string | null;
  state?: string | null;
  date_expiry?: string | null;
  application_method?: string | null;
  application_email?: string | null;
  career_page_link?: string | null;
  company?: { name?: string | null } | null;
  catalogs?: Array<{ name?: string | null }> | null;
};

export type EthiojobsMappedRow = {
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

export type FetchEthiojobsOptions = {
  baseUrl?: string;
  startPage?: number;
  pageSize?: number;
  maxJobs?: number;
  headers?: Record<string, string>;
};

const DEFAULT_DETAIL_TEMPLATE = "https://ethiojobs.net/job/{{slug}}";

function mapJob(j: EthiojobsJob, detailTemplate: string): EthiojobsMappedRow {
  const slug = j.slug?.trim();
  const sourceUrl = slug ? detailTemplate.replace(/\{\{slug\}\}/g, encodeURIComponent(slug)) : `ethiojobs:${j.id}`;
  const applyUrl = j.career_page_link?.trim() || (j.application_email?.trim() ? `mailto:${j.application_email.trim()}` : sourceUrl);

  return {
    title: j.title?.trim() || "Untitled",
    company: j.company?.name?.trim() || null,
    location: j.state?.trim() || null,
    category: j.catalogs?.[0]?.name?.trim() || null,
    description: (j.description ?? "").trim(),
    applyUrl,
    postedAt: j.date_published ? new Date(j.date_published) : null,
    sourceUrl,
    rawSource: j.application_method ?? "ethiojobs",
  };
}

export async function fetchEthiojobsJobsMapped(
  options: FetchEthiojobsOptions = {}
): Promise<EthiojobsMappedRow[]> {
  const baseUrl = options.baseUrl ?? process.env.ETHIOJOBS_API_URL?.trim() ?? DEFAULT_BASE_URL;
  const startPage = options.startPage ?? Math.max(1, Number(process.env.ETHIOJOBS_START_PAGE ?? "1"));
  const pageSize = options.pageSize ?? Math.min(50, Math.max(1, Number(process.env.ETHIOJOBS_PAGE_SIZE ?? "10")));
  const maxJobs = options.maxJobs ?? Math.min(500, Math.max(1, Number(process.env.ETHIOJOBS_JOBS_LIMIT ?? "200")));
  const detailTemplate = process.env.ETHIOJOBS_JOB_DETAIL_URL_TEMPLATE?.trim() ?? DEFAULT_DETAIL_TEMPLATE;

  let extraHeaders: Record<string, string> = {};
  if (process.env.ETHIOJOBS_API_HEADERS?.trim()) {
    try {
      extraHeaders = JSON.parse(process.env.ETHIOJOBS_API_HEADERS) as Record<string, string>;
    } catch {
      throw new Error("ETHIOJOBS_API_HEADERS must be valid JSON object");
    }
  }

  const all: EthiojobsMappedRow[] = [];
  let page = startPage;

  while (all.length < maxJobs) {
    const url = new URL(baseUrl);
    url.searchParams.set("featured", "undefined");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(pageSize));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "*/*",
        origin: "https://ethiojobs.net",
        referer: "https://ethiojobs.net/",
        "x-custom-header": process.env.ETHIOJOBS_CUSTOM_HEADER?.trim() || "",
        "user-agent":
          process.env.ETHIOJOBS_HTTP_USER_AGENT?.trim() ||
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
        ...extraHeaders,
        ...options.headers,
      },
    });

    const json = (await res.json()) as {
      data?: EthiojobsJob[];
      links?: { next?: string | null };
      meta?: { current_page?: number; last_page?: number };
      message?: string;
    };

    if (!res.ok) {
      throw new Error(`Ethiojobs HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
    }

    const rows = Array.isArray(json.data) ? json.data : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      all.push(mapJob(row, detailTemplate));
      if (all.length >= maxJobs) break;
    }

    const hasNextByLink = Boolean(json.links?.next);
    const hasNextByMeta =
      (json.meta?.current_page ?? page) < (json.meta?.last_page ?? page);
    if (!hasNextByLink && !hasNextByMeta) break;
    page += 1;
  }

  return all;
}
