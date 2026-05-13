import "dotenv/config";
import { prisma } from "@sheba/db";
import { fetchJobsFromApi, type FieldMap } from "./lib/fetchJobsFromApi.js";
import { enrichJobRow, type RawJobRow } from "./lib/jobEnrichment.js";
import { fetchAfriworkJobsMapped } from "./providers/afriworkJobs.js";
import { fetchEffoysiraJobsMapped } from "./providers/effoysiraJobs.js";
import { fetchEthiojobsJobsMapped } from "./providers/ethiojobsJobs.js";
import { fetchHahuJobsMapped } from "./providers/hahuJobs.js";

/** Display names for website scrapers (stored on Job.scrapedFrom). */
const SCRAPER_SITE_LABELS: Record<string, string> = {
  hahu: "HaHu Jobs",
  afriwork: "Afriworket",
  ethiojobs: "Ethiojobs",
  effoysira: "EffoySira",
};

function siteLabelForProvider(prefix: string): string {
  return SCRAPER_SITE_LABELS[prefix] ?? prefix;
}

function mergeScrapedFrom(existing: string | null | undefined, site: string): string {
  const parts = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) parts.add(t);
  };
  if (existing) {
    for (const p of existing.split(",")) add(p);
  }
  add(site);
  return Array.from(parts).sort((a, b) => a.localeCompare(b)).join(", ");
}

/**
 * Default: `all` (HaHu + Afriwork + Ethiojobs + EffoySira).
 * Other modes: `hahu`, `afriwork`, `ethiojobs`, `effoysira`, `generic`.
 */
async function runWebsiteScraper() {
  const provider = (process.env.WEBSITE_JOBS_PROVIDER ?? "all").toLowerCase().trim();

  if (provider === "all") {
    console.log("[website] provider: all (hahu + afriwork + ethiojobs + effoysira)");
    const [hahuResult, afriResult, ethioResult, effoysiraResult] = await Promise.allSettled([
      fetchHahuJobsMapped(),
      fetchAfriworkJobsMapped(),
      fetchEthiojobsJobsMapped(),
      fetchEffoysiraJobsMapped(),
    ]);
    let hahuCount = 0;
    let afriCount = 0;
    let ethioCount = 0;
    let effoysiraCount = 0;

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

    if (ethioResult.status === "fulfilled") {
      ethioCount = ethioResult.value.length;
      await persistRows(ethioResult.value, "ethiojobs");
    } else {
      console.error("[website] ethiojobs fetch failed:", ethioResult.reason);
    }

    if (effoysiraResult.status === "fulfilled") {
      effoysiraCount = effoysiraResult.value.length;
      await persistRows(effoysiraResult.value, "effoysira");
    } else {
      console.error("[website] effoysira fetch failed:", effoysiraResult.reason);
    }

    console.log(
      "[website] done,",
      hahuCount,
      "rows from HaHu,",
      afriCount,
      "rows from Afriwork and",
      ethioCount,
      "rows from Ethiojobs and",
      effoysiraCount,
      "rows from EffoySira"
    );
    return;
  }

  if (provider === "effoysira") {
    console.log("[website] provider: effoysira (WordPress REST)");
    const rows = await fetchEffoysiraJobsMapped();
    await persistRows(rows, "effoysira");
    console.log("[website] done,", rows.length, "rows from EffoySira");
    return;
  }

  if (provider === "ethiojobs") {
    console.log("[website] provider: ethiojobs (REST)");
    const rows = await fetchEthiojobsJobsMapped();
    await persistRows(rows, "ethiojobs");
    console.log("[website] done,", rows.length, "rows from Ethiojobs");
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

async function persistRows(rows: RawJobRow[], sourcePrefix: string) {
  for (const j of rows) {
    try {
      const enriched = enrichJobRow(j);
      if (enriched.isExpired) {
        console.log("[website] skip expired", enriched.title.slice(0, 70));
        continue;
      }
      const sourceTag = j.rawSource ? `${sourcePrefix}:${j.rawSource}` : sourcePrefix;
      const siteLabel = siteLabelForProvider(sourcePrefix);
      const existing = await prisma.job.findFirst({
        where: { canonicalKey: enriched.canonicalKey },
        select: { id: true, scrapedFrom: true },
      });
      if (existing) {
        const scrapedFrom = mergeScrapedFrom(existing.scrapedFrom, siteLabel);
        await prisma.job.update({
          where: { id: existing.id },
          data: {
          title: enriched.title,
          normalizedTitle: enriched.normalizedTitle,
          company: enriched.company,
          normalizedCompany: enriched.normalizedCompany,
          location: enriched.location,
          normalizedLocation: enriched.normalizedLocation,
          category: enriched.category,
          normalizedCategory: enriched.normalizedCategory,
          posterType: enriched.posterType,
          jobType: enriched.jobType,
          experienceLevel: enriched.experienceLevel,
          educationLevel: enriched.educationLevel,
          isRemote: enriched.isRemote,
          isInternship: enriched.isInternship,
          isExpired: enriched.isExpired,
          expiresAt: enriched.expiresAt,
          description: enriched.description,
          sourceUrl: enriched.sourceUrl,
          applyUrl: enriched.applyUrl,
          postedAt: enriched.postedAt,
          source: sourceTag,
          scrapedFrom,
        },
        });
      } else {
        await prisma.job.create({
          data: {
          title: enriched.title,
          normalizedTitle: enriched.normalizedTitle,
          company: enriched.company,
          normalizedCompany: enriched.normalizedCompany,
          location: enriched.location,
          normalizedLocation: enriched.normalizedLocation,
          category: enriched.category ?? "General",
          normalizedCategory: enriched.normalizedCategory,
          posterType: enriched.posterType,
          jobType: enriched.jobType,
          experienceLevel: enriched.experienceLevel,
          educationLevel: enriched.educationLevel,
          isRemote: enriched.isRemote,
          isInternship: enriched.isInternship,
          isExpired: enriched.isExpired,
          expiresAt: enriched.expiresAt,
          canonicalKey: enriched.canonicalKey,
          description: enriched.description,
          source: sourceTag,
          scrapedFrom: siteLabel,
          sourceUrl: enriched.sourceUrl,
          applyUrl: enriched.applyUrl ?? enriched.sourceUrl,
          postedAt: enriched.postedAt,
        },
        });
      }
      console.log("[website] upsert", enriched.title.slice(0, 70));
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
  let genericSiteLabel = process.env.WEBSITE_SCRAPER_SITE_LABEL?.trim();
  if (!genericSiteLabel) {
    try {
      genericSiteLabel = new URL(apiUrl).hostname.replace(/^www\./, "");
    } catch {
      genericSiteLabel = "Custom API";
    }
  }

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
      const enriched = enrichJobRow(j);
      if (enriched.isExpired) {
        console.log("[website] skip expired", enriched.title.slice(0, 70));
        continue;
      }
      const existing = await prisma.job.findFirst({
        where: { canonicalKey: enriched.canonicalKey },
        select: { id: true, scrapedFrom: true },
      });
      if (existing) {
        const scrapedFrom = mergeScrapedFrom(existing.scrapedFrom, genericSiteLabel);
        await prisma.job.update({
          where: { id: existing.id },
          data: {
          title: enriched.title,
          normalizedTitle: enriched.normalizedTitle,
          company: enriched.company,
          normalizedCompany: enriched.normalizedCompany,
          location: enriched.location,
          normalizedLocation: enriched.normalizedLocation,
          category: enriched.category,
          normalizedCategory: enriched.normalizedCategory,
          posterType: enriched.posterType,
          jobType: enriched.jobType,
          experienceLevel: enriched.experienceLevel,
          educationLevel: enriched.educationLevel,
          isRemote: enriched.isRemote,
          isInternship: enriched.isInternship,
          isExpired: enriched.isExpired,
          expiresAt: enriched.expiresAt,
          description: enriched.description,
          sourceUrl: enriched.sourceUrl,
          applyUrl: enriched.applyUrl,
          postedAt: enriched.postedAt,
          source: "website_api",
          scrapedFrom,
        },
        });
      } else {
        await prisma.job.create({
          data: {
          title: enriched.title,
          normalizedTitle: enriched.normalizedTitle,
          company: enriched.company,
          normalizedCompany: enriched.normalizedCompany,
          location: enriched.location,
          normalizedLocation: enriched.normalizedLocation,
          category: enriched.category ?? "General",
          normalizedCategory: enriched.normalizedCategory,
          posterType: enriched.posterType,
          jobType: enriched.jobType,
          experienceLevel: enriched.experienceLevel,
          educationLevel: enriched.educationLevel,
          isRemote: enriched.isRemote,
          isInternship: enriched.isInternship,
          isExpired: enriched.isExpired,
          expiresAt: enriched.expiresAt,
          canonicalKey: enriched.canonicalKey,
          description: enriched.description ?? "",
          source: "website_api",
          scrapedFrom: genericSiteLabel,
          sourceUrl: enriched.sourceUrl,
          applyUrl: enriched.applyUrl ?? enriched.sourceUrl,
          postedAt: enriched.postedAt,
        },
        });
      }
      console.log("[website] upsert", enriched.title);
    } catch (err) {
      console.error("[website] upsert error", j.title, err);
    }
  }
}

runWebsiteScraper().catch((err) => {
  console.error(err);
  process.exit(1);
});
