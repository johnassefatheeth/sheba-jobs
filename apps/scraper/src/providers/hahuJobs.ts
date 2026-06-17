/**
 * HaHu Jobs public GraphQL API (same endpoint as www.hahu.jobs).
 * @see https://www.hahu.jobs — use only in line with their terms of service.
 */

const DEFAULT_GRAPHQL_URL = "https://graph.aggregator.hahu.jobs/v1/graphql";

const HAHU_JOB_FIELDS = `
    id
    title
    summary
    salary
    deadline
    expired
    location
    source
    application_method
    application_url
    application_email
    approved_on
    job_cities {
      city {
        name
        region {
          name
        }
      }
    }
    entity {
      name
      {{entityLogo}}
    }
    sub_sector {
      name
      sector {
        name
      }
    }
    area {
      address
      name
    }
`;

function buildHahuJobsQuery(includeEntityLogo: boolean): string {
  const fields = HAHU_JOB_FIELDS.replace("{{entityLogo}}", includeEntityLogo ? "logo" : "");
  return `
query HahuJobList(
  $args: search_jobs_args!
  $filter: jobs_bool_exp
  $limit: Int
  $offset: Int
  $orderBy: [jobs_order_by!]
) {
  jobs: search_jobs(
    where: $filter
    order_by: $orderBy
    args: $args
    offset: $offset
    limit: $limit
  ) {
${fields}
  }
}
`.trim();
}

export type HahuGraphqlJob = {
  id: string;
  title: string;
  summary?: string | null;
  salary?: number | null;
  deadline?: string | null;
  expired?: boolean;
  location?: string | null;
  source?: string | null;
  application_method?: string | null;
  application_url?: string | null;
  application_email?: string | null;
  approved_on?: string | null;
  job_cities?: Array<{
    city?: { name?: string | null; region?: { name?: string | null } | null } | null;
  }> | null;
  entity?: { name?: string | null; logo?: string | null } | null;
  sub_sector?: { name?: string | null; sector?: { name?: string | null } | null } | null;
  area?: { address?: string | null; name?: string | null } | null;
};

export type HahuMappedRow = {
  title: string;
  company: string | null;
  location: string | null;
  category: string | null;
  description: string;
  applyUrl: string | null;
  postedAt: Date | null;
  sourceUrl: string;
  rawSource: string | null;
  expiresAt?: Date | null;
  isExpired?: boolean;
  companyLogoUrl?: string | null;
};

function formatLocation(j: HahuGraphqlJob): string | null {
  if (j.location?.trim()) return j.location.trim();
  if (j.area?.name || j.area?.address) {
    return [j.area.address, j.area.name].filter(Boolean).join(", ") || null;
  }
  const parts = (j.job_cities ?? [])
    .map((jc) => [jc.city?.name, jc.city?.region?.name].filter(Boolean).join(", "))
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function buildApplyUrl(j: HahuGraphqlJob): string | null {
  const u = j.application_url?.trim();
  if (u) return u;
  const e = j.application_email?.trim();
  if (e) return `mailto:${e}`;
  return null;
}

function mapJob(j: HahuGraphqlJob, detailTemplate: string): HahuMappedRow {
  const detailUrl = detailTemplate.replace(/\{\{id\}\}/g, encodeURIComponent(j.id));
  return {
    title: j.title?.trim() || "Untitled",
    company: j.entity?.name?.trim() ?? null,
    location: formatLocation(j),
    category: j.sub_sector?.sector?.name ?? j.sub_sector?.name ?? null,
    description: (j.summary ?? "").trim(),
    applyUrl: buildApplyUrl(j),
    postedAt: j.approved_on ? new Date(j.approved_on) : j.deadline ? new Date(j.deadline) : null,
    sourceUrl: detailUrl,
    rawSource: j.source ?? null,
    expiresAt: j.deadline ? new Date(j.deadline) : null,
    isExpired: Boolean(j.expired),
    companyLogoUrl: j.entity?.logo?.trim() || null,
  };
}

export type FetchHahuOptions = {
  graphqlUrl?: string;
  limit?: number;
  offset?: number;
  detailUrlTemplate?: string;
};

/** Public job URL pattern — override with `HAHU_JOB_DETAIL_URL_TEMPLATE` if HaHu changes routes. */
const DEFAULT_DETAIL_TEMPLATE = "https://www.hahu.jobs/job/{{id}}";

async function fetchHahuJobsRaw(
  graphqlUrl: string,
  gqlVariables: Record<string, unknown>,
  includeEntityLogo: boolean
): Promise<HahuGraphqlJob[]> {
  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "*/*",
      origin: "https://www.hahu.jobs",
      referer: "https://www.hahu.jobs/",
      "user-agent":
        process.env.HAHU_HTTP_USER_AGENT?.trim() ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ query: buildHahuJobsQuery(includeEntityLogo), variables: gqlVariables }),
  });

  const json = (await res.json()) as {
    errors?: Array<{ message: string }>;
    data?: { jobs?: HahuGraphqlJob[] };
  };

  if (!res.ok) {
    throw new Error(`HaHu GraphQL HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  if (json.errors?.length) {
    const message = json.errors.map((e) => e.message).join("; ");
    if (includeEntityLogo && /logo/i.test(message)) {
      return fetchHahuJobsRaw(graphqlUrl, gqlVariables, false);
    }
    throw new Error(`HaHu GraphQL errors: ${message}`);
  }

  const jobs = json.data?.jobs;
  if (!Array.isArray(jobs)) {
    throw new Error("HaHu GraphQL: missing data.jobs array");
  }
  return jobs;
}

export async function fetchHahuJobsMapped(options: FetchHahuOptions = {}): Promise<HahuMappedRow[]> {
  const graphqlUrl = options.graphqlUrl ?? process.env.HAHU_GRAPHQL_URL?.trim() ?? DEFAULT_GRAPHQL_URL;
  const limit = options.limit ?? Math.min(2000, Math.max(1, Number(process.env.HAHU_JOBS_LIMIT ?? "500")));
  const offset = options.offset ?? Math.max(0, Number(process.env.HAHU_JOBS_OFFSET ?? "0"));
  const detailTemplate =
    options.detailUrlTemplate?.trim() ??
    process.env.HAHU_JOB_DETAIL_URL_TEMPLATE?.trim() ??
    DEFAULT_DETAIL_TEMPLATE;

  const gqlVariables = {
    args: {} as Record<string, unknown>,
    filter: {
      _and: [{ expired: { _eq: false } }, { requested_to_delete: { _eq: false } }],
    },
    limit,
    offset,
    orderBy: [{ approved_on: "desc" }],
  };

  const jobs = await fetchHahuJobsRaw(graphqlUrl, gqlVariables, true);
  return jobs.map((j) => mapJob(j, detailTemplate));
}
