import "dotenv/config";
import { ensureUniqueJobSlug, prisma } from "@sheba/db";
import { fetchJobsFromApi, type FieldMap } from "./fetchJobsFromApi.js";
import { enrichJobRow, type RawJobRow } from "./jobEnrichment.js";
import { announceJobOnTelegram, assignSlugIfMissing } from "./jobPublish.js";
import { fetchAfriworkJobsMapped } from "../providers/afriworkJobs.js";
import { fetchEffoysiraJobsMapped } from "../providers/effoysiraJobs.js";
import { fetchEthiojobsJobsMapped } from "../providers/ethiojobsJobs.js";
import { fetchHahuJobsMapped } from "../providers/hahuJobs.js";

const DEFAULT_INTERVAL_MS = 20 * 60 * 1000;

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

export function scrapedFromIncludesSite(
  scrapedFrom: string | null | undefined,
  siteLabel: string
): boolean {
  if (!scrapedFrom?.trim()) return false;
  return scrapedFrom.split(",").map((s) => s.trim()).includes(siteLabel);
}

type PersistStats = { skipped: number; created: number; updated: number; refreshed: number; expired: number };

type ExistingByUrl = {
  id: string;
  sourceUrl: string | null;
  scrapedFrom: string | null;
  slug: string | null;
};

async function loadExistingBySourceUrl(sourceUrls: string[]): Promise<Map<string, ExistingByUrl>> {
  if (sourceUrls.length === 0) return new Map();
  const rows = await prisma.job.findMany({
    where: { sourceUrl: { in: sourceUrls } },
    select: { id: true, sourceUrl: true, scrapedFrom: true, slug: true },
  });
  const map = new Map<string, ExistingByUrl>();
  for (const row of rows) {
    if (row.sourceUrl) map.set(row.sourceUrl, row as ExistingByUrl);
  }
  return map;
}

function enrichmentUpdateData(enriched: ReturnType<typeof enrichJobRow>, sourceTag: string, scrapedFrom: string) {
  return {
    title: enriched.title,
    normalizedTitle: enriched.normalizedTitle,
    company: enriched.company,
    normalizedCompany: enriched.normalizedCompany,
    ...(enriched.companyLogoUrl ? { companyLogoUrl: enriched.companyLogoUrl } : {}),
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
    applyUrl: enriched.applyUrl,
    postedAt: enriched.postedAt,
    source: sourceTag,
    scrapedFrom,
  };
}

async function persistRows(rows: RawJobRow[], sourcePrefix: string): Promise<PersistStats> {
  const stats: PersistStats = { skipped: 0, created: 0, updated: 0, refreshed: 0, expired: 0 };
  const siteLabel = siteLabelForProvider(sourcePrefix);
  const sourceUrls = rows.map((r) => r.sourceUrl).filter(Boolean);
  const existingByUrl = await loadExistingBySourceUrl(sourceUrls);

  for (const j of rows) {
    try {
      const enriched = enrichJobRow(j);
      if (enriched.isExpired) {
        stats.expired++;
        console.log("[website] skip expired", enriched.title.slice(0, 70));
        continue;
      }

      const sourceTag = j.rawSource ? `${sourcePrefix}:${j.rawSource}` : sourcePrefix;
      const byUrl = existingByUrl.get(j.sourceUrl);
      if (byUrl) {
        const scrapedFrom = mergeScrapedFrom(byUrl.scrapedFrom, siteLabel);
        const slug =
          byUrl.slug ||
          (await assignSlugIfMissing({
            id: byUrl.id,
            title: enriched.title,
            company: enriched.company,
            slug: byUrl.slug,
          }));
        await prisma.job.update({
          where: { id: byUrl.id },
          data: { slug, ...enrichmentUpdateData(enriched, sourceTag, scrapedFrom) },
        });
        stats.refreshed++;
        continue;
      }

      const existing = await prisma.job.findFirst({
        where: { canonicalKey: enriched.canonicalKey },
        select: {
          id: true,
          title: true,
          company: true,
          scrapedFrom: true,
          slug: true,
          telegramPostedAt: true,
        },
      });

      if (existing) {
        if (scrapedFromIncludesSite(existing.scrapedFrom, siteLabel)) {
          stats.skipped++;
          continue;
        }

        const scrapedFrom = mergeScrapedFrom(existing.scrapedFrom, siteLabel);
        const slug = existing.slug || (await assignSlugIfMissing(existing));
        await prisma.job.update({
          where: { id: existing.id },
          data: {
            slug,
            sourceUrl: enriched.sourceUrl,
            ...enrichmentUpdateData(enriched, sourceTag, scrapedFrom),
          },
        });
        stats.updated++;
        if (enriched.sourceUrl) {
          existingByUrl.set(enriched.sourceUrl, {
            id: existing.id,
            sourceUrl: enriched.sourceUrl,
            scrapedFrom,
            slug,
          });
        }
        console.log("[website] merge", enriched.title.slice(0, 70));
        continue;
      }

      const slug = await ensureUniqueJobSlug(prisma, enriched.title, enriched.company);
      const created = await prisma.job.create({
        data: {
          slug,
          title: enriched.title,
          normalizedTitle: enriched.normalizedTitle,
          company: enriched.company,
          normalizedCompany: enriched.normalizedCompany,
          companyLogoUrl: enriched.companyLogoUrl,
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
      await announceJobOnTelegram(created, true);
      stats.created++;
      if (enriched.sourceUrl) {
        existingByUrl.set(enriched.sourceUrl, {
          id: created.id,
          sourceUrl: enriched.sourceUrl,
          scrapedFrom: siteLabel,
          slug: created.slug ?? null,
        });
      }
      console.log("[website] new", enriched.title.slice(0, 70));
    } catch (err) {
      console.error("[website] upsert error", j.title, err);
    }
  }

  return stats;
}

function logPersistStats(provider: string, fetched: number, stats: PersistStats) {
  console.log(
    `[website] ${provider}: ${fetched} fetched, ${stats.refreshed} refreshed, ${stats.skipped} skipped, ${stats.created} new, ${stats.updated} merged, ${stats.expired} expired`
  );
}

/**
 * Default: `all` (HaHu + Afriwork + Ethiojobs + EffoySira).
 * Other modes: `hahu`, `afriwork`, `ethiojobs`, `effoysira`, `generic`.
 */
export async function runWebsiteScraper(): Promise<void> {
  const started = Date.now();
  console.log("[website] scrape run started", new Date().toISOString());

  const provider = (process.env.WEBSITE_JOBS_PROVIDER ?? "all").toLowerCase().trim();

  if (provider === "all") {
    console.log("[website] provider: all (hahu + afriwork + ethiojobs + effoysira)");
    const [hahuResult, afriResult, ethioResult, effoysiraResult] = await Promise.allSettled([
      fetchHahuJobsMapped(),
      fetchAfriworkJobsMapped(),
      fetchEthiojobsJobsMapped(),
      fetchEffoysiraJobsMapped(),
    ]);

    if (hahuResult.status === "fulfilled") {
      const stats = await persistRows(hahuResult.value, "hahu");
      logPersistStats("hahu", hahuResult.value.length, stats);
    } else {
      console.error("[website] hahu fetch failed:", hahuResult.reason);
    }

    if (afriResult.status === "fulfilled") {
      const stats = await persistRows(afriResult.value, "afriwork");
      logPersistStats("afriwork", afriResult.value.length, stats);
    } else {
      console.error("[website] afriwork fetch failed:", afriResult.reason);
    }

    if (ethioResult.status === "fulfilled") {
      const stats = await persistRows(ethioResult.value, "ethiojobs");
      logPersistStats("ethiojobs", ethioResult.value.length, stats);
    } else {
      console.error("[website] ethiojobs fetch failed:", ethioResult.reason);
    }

    if (effoysiraResult.status === "fulfilled") {
      const stats = await persistRows(effoysiraResult.value, "effoysira");
      logPersistStats("effoysira", effoysiraResult.value.length, stats);
    } else {
      console.error("[website] effoysira fetch failed:", effoysiraResult.reason);
    }
  } else if (provider === "effoysira") {
    console.log("[website] provider: effoysira (WordPress REST)");
    const rows = await fetchEffoysiraJobsMapped();
    const stats = await persistRows(rows, "effoysira");
    logPersistStats("effoysira", rows.length, stats);
  } else if (provider === "ethiojobs") {
    console.log("[website] provider: ethiojobs (REST)");
    const rows = await fetchEthiojobsJobsMapped();
    const stats = await persistRows(rows, "ethiojobs");
    logPersistStats("ethiojobs", rows.length, stats);
  } else if (provider === "afriwork") {
    console.log("[website] provider: afriwork (GraphQL)");
    const rows = await fetchAfriworkJobsMapped();
    const stats = await persistRows(rows, "afriwork");
    logPersistStats("afriwork", rows.length, stats);
  } else if (provider === "generic") {
    await runGenericApiScraper();
  } else {
    console.log("[website] provider: hahu (GraphQL)");
    const rows = await fetchHahuJobsMapped();
    const stats = await persistRows(rows, "hahu");
    logPersistStats("hahu", rows.length, stats);
  }

  console.log("[website] scrape run finished in", Math.round((Date.now() - started) / 1000), "s");
}

async function runGenericApiScraper() {
  const apiUrl = process.env.WEBSITE_JOBS_API_URL?.trim();
  if (!apiUrl) {
    throw new Error(
      "WEBSITE_JOBS_PROVIDER=generic requires WEBSITE_JOBS_API_URL and WEBSITE_JOBS_FIELD_MAP. See apps/scraper/README.md"
    );
  }

  const listPath = process.env.WEBSITE_JOBS_LIST_PATH?.trim() || undefined;
  const detailUrlTemplate = process.env.WEBSITE_JOBS_DETAIL_URL_TEMPLATE?.trim() || undefined;
  const idPath = process.env.WEBSITE_JOBS_ID_PATH?.trim() || "id";

  let fieldMap: FieldMap;
  try {
    fieldMap = JSON.parse(process.env.WEBSITE_JOBS_FIELD_MAP || "{}") as FieldMap;
  } catch {
    throw new Error("WEBSITE_JOBS_FIELD_MAP must be valid JSON.");
  }

  let headers: Record<string, string> | undefined;
  if (process.env.WEBSITE_JOBS_API_HEADERS?.trim()) {
    try {
      headers = JSON.parse(process.env.WEBSITE_JOBS_API_HEADERS) as Record<string, string>;
    } catch {
      throw new Error("WEBSITE_JOBS_API_HEADERS must be valid JSON object.");
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

  const stats: PersistStats = { skipped: 0, created: 0, updated: 0, refreshed: 0, expired: 0 };
  const existingByUrl = await loadExistingBySourceUrl(jobs.map((j) => j.sourceUrl).filter(Boolean));

  for (const j of jobs) {
    try {
      const enriched = enrichJobRow(j);
      if (enriched.isExpired) {
        stats.expired++;
        console.log("[website] skip expired", enriched.title.slice(0, 70));
        continue;
      }

      const byUrl = existingByUrl.get(j.sourceUrl);
      if (byUrl) {
        const scrapedFrom = mergeScrapedFrom(byUrl.scrapedFrom, genericSiteLabel);
        const slug =
          byUrl.slug ||
          (await assignSlugIfMissing({
            id: byUrl.id,
            title: enriched.title,
            company: enriched.company,
            slug: byUrl.slug,
          }));
        await prisma.job.update({
          where: { id: byUrl.id },
          data: { slug, ...enrichmentUpdateData(enriched, "website_api", scrapedFrom) },
        });
        stats.refreshed++;
        continue;
      }

      const existing = await prisma.job.findFirst({
        where: { canonicalKey: enriched.canonicalKey },
        select: {
          id: true,
          title: true,
          company: true,
          scrapedFrom: true,
          slug: true,
          telegramPostedAt: true,
        },
      });

      if (existing) {
        if (scrapedFromIncludesSite(existing.scrapedFrom, genericSiteLabel)) {
          stats.skipped++;
          continue;
        }

        const scrapedFrom = mergeScrapedFrom(existing.scrapedFrom, genericSiteLabel);
        const slug = existing.slug || (await assignSlugIfMissing(existing));
        await prisma.job.update({
          where: { id: existing.id },
          data: {
            slug,
            sourceUrl: enriched.sourceUrl,
            ...enrichmentUpdateData(enriched, "website_api", scrapedFrom),
          },
        });
        stats.updated++;
        console.log("[website] merge", enriched.title);
        continue;
      }

      const slug = await ensureUniqueJobSlug(prisma, enriched.title, enriched.company);
      const created = await prisma.job.create({
        data: {
          slug,
          title: enriched.title,
          normalizedTitle: enriched.normalizedTitle,
          company: enriched.company,
          normalizedCompany: enriched.normalizedCompany,
          companyLogoUrl: enriched.companyLogoUrl,
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
      await announceJobOnTelegram(created, true);
      stats.created++;
      console.log("[website] new", enriched.title);
    } catch (err) {
      console.error("[website] upsert error", j.title, err);
    }
  }

  logPersistStats("generic", jobs.length, stats);
}

let scrapeInProgress = false;

/** Run immediately, then on a fixed interval while the process stays alive. */
export function startWebsiteScraperScheduler(options?: { intervalMs?: number }) {
  const intervalMs = options?.intervalMs ?? Number(process.env.WEBSITE_SCRAPER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  const minutes = Math.round(intervalMs / 60_000);

  const tick = async () => {
    if (scrapeInProgress) {
      console.log("[website] scrape already in progress, skipping this tick");
      return;
    }
    scrapeInProgress = true;
    try {
      await runWebsiteScraper();
    } catch (err) {
      console.error("[website] scheduled scrape failed:", err);
    } finally {
      scrapeInProgress = false;
    }
  };

  console.log(`[website] scheduler: every ${minutes} minute(s)`);
  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
