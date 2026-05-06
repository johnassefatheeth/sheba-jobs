/**
 * Afriworket public GraphQL API.
 * @see https://api.afriworket.com/v1/graphql
 */

const DEFAULT_GRAPHQL_URL = "https://api.afriworket.com/v1/graphql";

const AFRIWORK_QUERY = `
query GetAllJobs($offset: Int!, $whereCondition: jobs_bool_exp!, $orderCondition: [jobs_order_by!]) {
  jobs(order_by: $orderCondition, offset: $offset, limit: 20, where: $whereCondition) {
    id
    title
    created_at
    updated_at
    published_at
    refreshed_at
    approval_status
    description
    job_type
    job_site
    city {
      name
      country { name }
    }
    sectors { sector { name } }
    deadline
    compensation_type
    compensation_currency
    experience_level
    entity { type name }
  }
}
`.trim();

type AfriworkJob = {
  id: string;
  title: string;
  created_at?: string | null;
  published_at?: string | null;
  refreshed_at?: string | null;
  approval_status?: string | null;
  description?: string | null;
  city?: { name?: string | null; country?: { name?: string | null } | null } | null;
  sectors?: Array<{ sector?: { name?: string | null } | null }> | null;
  deadline?: string | null;
  compensation_type?: string | null;
  compensation_currency?: string | null;
  experience_level?: string | null;
  entity?: { type?: string | null; name?: string | null } | null;
};

export type AfriworkMappedRow = {
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

function mapJob(j: AfriworkJob, detailTemplate: string): AfriworkMappedRow {
  const sourceUrl = detailTemplate.replace(/\{\{id\}\}/g, encodeURIComponent(j.id));
  const city = j.city?.name?.trim() || null;
  const country = j.city?.country?.name?.trim() || null;
  const category = j.sectors?.[0]?.sector?.name?.trim() || null;
  const posted = j.refreshed_at ?? j.published_at ?? j.created_at ?? null;

  return {
    title: j.title?.trim() || "Untitled",
    company: j.entity?.name?.trim() || null,
    location: [city, country].filter(Boolean).join(", ") || null,
    category,
    description: (j.description ?? "").trim(),
    applyUrl: sourceUrl,
    postedAt: posted ? new Date(posted) : null,
    sourceUrl,
    rawSource: j.approval_status ?? "PUBLISHED",
  };
}

export type FetchAfriworkOptions = {
  graphqlUrl?: string;
  offset?: number;
  detailUrlTemplate?: string;
  headers?: Record<string, string>;
  maxJobs?: number;
  pageSize?: number;
};

const DEFAULT_DETAIL_TEMPLATE = "https://afriworket.com/jobs/{{id}}";

export async function fetchAfriworkJobsMapped(
  options: FetchAfriworkOptions = {}
): Promise<AfriworkMappedRow[]> {
  const graphqlUrl = options.graphqlUrl ?? process.env.AFRIWORK_GRAPHQL_URL?.trim() ?? DEFAULT_GRAPHQL_URL;
  const startOffset = options.offset ?? Math.max(0, Number(process.env.AFRIWORK_JOBS_OFFSET ?? "0"));
  const pageSize = options.pageSize ?? Math.min(50, Math.max(1, Number(process.env.AFRIWORK_JOBS_PAGE_SIZE ?? "20")));
  const maxJobs = options.maxJobs ?? Math.min(500, Math.max(1, Number(process.env.AFRIWORK_JOBS_LIMIT ?? "200")));
  const detailTemplate =
    options.detailUrlTemplate?.trim() ??
    process.env.AFRIWORK_JOB_DETAIL_URL_TEMPLATE?.trim() ??
    DEFAULT_DETAIL_TEMPLATE;

  let extraHeaders: Record<string, string> = {};
  if (process.env.AFRIWORK_API_HEADERS?.trim()) {
    try {
      extraHeaders = JSON.parse(process.env.AFRIWORK_API_HEADERS) as Record<string, string>;
    } catch {
      throw new Error("AFRIWORK_API_HEADERS must be valid JSON object");
    }
  }

  const all: AfriworkMappedRow[] = [];
  let offset = startOffset;
  const orderCondition = { latest_activity_at: "desc" };
  const whereCondition = { _and: [{ approval_status: { _in: ["PUBLISHED", "REFRESHED"] } }] };

  while (all.length < maxJobs) {
    const body = {
      operationName: "GetAllJobs",
      // Keep the same operation shape but inject page size for this request.
      query: AFRIWORK_QUERY.replace("limit: 20", `limit: ${pageSize}`),
      variables: {
        offset,
        orderCondition,
        whereCondition,
      },
    };

    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept:
          "application/graphql-response+json, application/graphql+json, application/json, text/event-stream, multipart/mixed",
        origin: "https://afriworket.com",
        referer: "https://afriworket.com/",
        "x-hasura-role": process.env.AFRIWORK_HASURA_ROLE?.trim() || "anonymous",
        "user-agent":
          process.env.AFRIWORK_HTTP_USER_AGENT?.trim() ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...extraHeaders,
        ...options.headers,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as {
      errors?: Array<{ message: string }>;
      data?: { jobs?: AfriworkJob[] };
    };

    if (!res.ok) {
      throw new Error(`Afriwork GraphQL HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
    }
    if (json.errors?.length) {
      throw new Error(`Afriwork GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    const jobs = json.data?.jobs;
    if (!Array.isArray(jobs)) {
      throw new Error("Afriwork GraphQL: missing data.jobs array");
    }
    if (jobs.length === 0) break;

    for (const j of jobs) {
      all.push(mapJob(j, detailTemplate));
      if (all.length >= maxJobs) break;
    }

    if (jobs.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}
