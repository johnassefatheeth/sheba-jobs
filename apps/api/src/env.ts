const WORKER_ENV_KEYS = [
  "ADMIN_PASSWORD",
  "ADMIN_TOKEN_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_CHANNEL_ID",
  "TELEGRAM_BOT_GROUP_ID",
  "TELEGRAM_CHANNEL_LINK",
  "TELEGRAM_GROUP_LINK",
  "WEBSITE_JOBS_PROVIDER",
  "WEBSITE_SCRAPER_ENABLED",
  "HAHU_GRAPHQL_URL",
  "HAHU_JOBS_LIMIT",
  "HAHU_JOBS_OFFSET",
  "HAHU_JOB_DETAIL_URL_TEMPLATE",
  "AFRIWORK_GRAPHQL_URL",
  "AFRIWORK_JOBS_OFFSET",
  "AFRIWORK_JOBS_PAGE_SIZE",
  "AFRIWORK_JOBS_LIMIT",
  "AFRIWORK_JOB_DETAIL_URL_TEMPLATE",
  "AFRIWORK_API_HEADERS",
  "AFRIWORK_HASURA_ROLE",
  "ETHIOJOBS_API_URL",
  "ETHIOJOBS_START_PAGE",
  "ETHIOJOBS_PAGE_SIZE",
  "ETHIOJOBS_JOBS_LIMIT",
  "ETHIOJOBS_JOB_DETAIL_URL_TEMPLATE",
  "ETHIOJOBS_CUSTOM_HEADER",
  "ETHIOJOBS_API_HEADERS",
  "EFFOYSIRA_API_URL",
  "EFFOYSIRA_START_PAGE",
  "EFFOYSIRA_PAGE_SIZE",
  "EFFOYSIRA_JOBS_LIMIT",
  "EFFOYSIRA_API_HEADERS",
  "WEBSITE_JOBS_API_URL",
  "WEBSITE_JOBS_LIST_PATH",
  "WEBSITE_JOBS_FIELD_MAP",
  "WEBSITE_JOBS_DETAIL_URL_TEMPLATE",
  "WEBSITE_JOBS_ID_PATH",
  "WEBSITE_JOBS_API_HEADERS",
  "WEBSITE_SCRAPER_SITE_LABEL",
  "TELEGRAM_SYNC_CHANNEL_INFO",
  "FRONTEND_URL",
  "API_PUBLIC_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

export type Env = {
  HYPERDRIVE: Hyperdrive;
  UPLOADS?: R2Bucket;
} & {
  [K in (typeof WORKER_ENV_KEYS)[number]]?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var shebaUploadsBucket: R2Bucket | undefined;
}

export function applyWorkerEnv(env: Env) {
  for (const key of WORKER_ENV_KEYS) {
    const value = env[key];
    if (value != null && value !== "") {
      process.env[key] = value;
    }
  }

  if (!process.env.API_PUBLIC_URL) {
    process.env.API_PUBLIC_URL = "https://api.sheba-labs.com";
  }
}

export function configureUploads(bucket?: R2Bucket) {
  globalThis.shebaUploadsBucket = bucket;
}

export function getUploadsBucket(): R2Bucket | undefined {
  return globalThis.shebaUploadsBucket;
}
