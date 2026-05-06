import "dotenv/config";
import { prisma } from "@sheba/db";
import { fetchJobsFromApi, type FieldMap } from "./lib/fetchJobsFromApi.js";
import { fetchAfriworkJobsMapped } from "./providers/afriworkJobs.js";
import { fetchHahuJobsMapped } from "./providers/hahuJobs.js";

/**
 * Default: `all` (HaHu + Afriwork).
 * Other modes: `hahu`, `afriwork`, `generic`.
 */
async function runWebsiteScraper() {
  const provider = (process.env.WEBSITE_JOBS_PROVIDER ?? "all").toLowerCase().trim();

  if (provider === "all") {
    console.log("[website] provider: all (hahu + afriwork)");
    const [hahuResult, afriResult] = await Promise.allSettled([fetchHahuJobsMapped(), fetchAfriworkJobsMapped()]);
    let hahuCount = 0;
    let afriCount = 0;

    if (hahuResult.status === "fulfilled") {
      hahuCount = hahuResult.value.length;
      await persistRows(hahuResult.value, "hahu");
    } else {
      console.error("[website] hahu fetch failed:", hahuResult.reason);
    }

    if (afriResult.status === "fulfilled") {
      afriCount = afriResult.value.length;
      await persistRows(afriResult.value, "afriwork");
    } else {
      console.error("[website] afriwork fetch failed:", afriResult.reason);
    }

    console.log("[website] done,", hahuCount, "rows from HaHu and", afriCount, "rows from Afriwork");
    return;
  }

  if (provider === "afriwork") {
    console.log("[website] provider: afriwork (GraphQL)");
    const rows = await fetchAfriworkJobsMapped();
    await persistRows(rows, "afriwork");
    console.log("[website] done,", rows.length, "rows from Afriwork");
    return;
  }

  if (provider === "generic") {
    await runGenericApiScraper();
    return;
  }

  console.log("[website] provider: hahu (GraphQL)");
  const rows = await fetchHahuJobsMapped();
  await persistRows(rows, "hahu");

  console.log("[website] done,", rows.length, "rows from HaHu");
}

async function persistRows(
  rows: Array<{
    title: string;
    company: string | null;
    location: string | null;
    category: string | null;
    description: string;
    applyUrl: string | null;
    postedAt: Date | null;
    sourceUrl: string;
    rawSource: string | null;
  }>,
  sourcePrefix: string
) {
  for (const j of rows) {
    try {
      const sourceTag = j.rawSource ? `${sourcePrefix}:${j.rawSource}` : sourcePrefix;
      await prisma.job.upsert({
        where: { title_sourceUrl_unique: { title: j.title, sourceUrl: j.sourceUrl } },
        update: {
          company: j.company,
          location: j.location,
          category: j.category,
          description: j.description,
          applyUrl: j.applyUrl,
          postedAt: j.postedAt,
          source: sourceTag,
        },
        create: {
          title: j.title,
          company: j.company,
          location: j.location,
          category: j.category ?? "General",
          description: j.description,
          source: sourceTag,
          sourceUrl: j.sourceUrl,
          applyUrl: j.applyUrl ?? j.sourceUrl,
          postedAt: j.postedAt,
        },
      });
      console.log("[website] upsert", j.title.slice(0, 70));
    } catch (err) {
      console.error("[website] upsert error", j.title, err);
    }
  }
}

async function runGenericApiScraper() {
  const apiUrl = process.env.WEBSITE_JOBS_API_URL?.trim();
  if (!apiUrl) {
    console.error(
      "WEBSITE_JOBS_PROVIDER=generic requires WEBSITE_JOBS_API_URL and WEBSITE_JOBS_FIELD_MAP. See apps/scraper/README.md"
    );
    process.exit(1);
  }

  const listPath = process.env.WEBSITE_JOBS_LIST_PATH?.trim() || undefined;
  const detailUrlTemplate = process.env.WEBSITE_JOBS_DETAIL_URL_TEMPLATE?.trim() || undefined;
  const idPath = process.env.WEBSITE_JOBS_ID_PATH?.trim() || "id";

  let fieldMap: FieldMap;
  try {
    fieldMap = JSON.parse(process.env.WEBSITE_JOBS_FIELD_MAP || "{}") as FieldMap;
  } catch {
    console.error("WEBSITE_JOBS_FIELD_MAP must be valid JSON.");
    process.exit(1);
  }

  let headers: Record<string, string> | undefined;
  if (process.env.WEBSITE_JOBS_API_HEADERS?.trim()) {
    try {
      headers = JSON.parse(process.env.WEBSITE_JOBS_API_HEADERS) as Record<string, string>;
    } catch {
      console.error("WEBSITE_JOBS_API_HEADERS must be valid JSON object.");
      process.exit(1);
    }
  }

  console.log("[website] provider: generic GET", apiUrl);
  const jobs = await fetchJobsFromApi({
    apiUrl,
    listPath,
    fieldMap,
    headers,
    detailUrlTemplate,
    idPath,
  });

  for (const j of jobs) {
    try {
      await prisma.job.upsert({
        where: { title_sourceUrl_unique: { title: j.title, sourceUrl: j.sourceUrl } },
        update: {
          company: j.company,
          location: j.location,
          category: j.category,
          description: j.description,
          applyUrl: j.applyUrl,
          postedAt: j.postedAt,
        },
        create: {
          title: j.title,
          company: j.company,
          location: j.location,
          category: j.category ?? "General",
          description: j.description ?? "",
          source: "website_api",
          sourceUrl: j.sourceUrl,
          applyUrl: j.applyUrl ?? j.sourceUrl,
          postedAt: j.postedAt,
        },
      });
      console.log("[website] upsert", j.title);
    } catch (err) {
      console.error("[website] upsert error", j.title, err);
    }
  }
}

runWebsiteScraper().catch((err) => {
  console.error(err);
  process.exit(1);
});
