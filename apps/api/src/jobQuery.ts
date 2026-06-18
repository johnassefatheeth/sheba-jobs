import type { Request } from "express";
import { prisma } from "@sheba/db/shared";

export type JobListQuery = {
  search?: string;
  location?: string;
  category?: string;
  posterType?: string;
  jobType?: string;
  experienceLevel?: string;
  educationLevel?: string;
  scrapedFrom?: string;
  isRemote?: boolean;
  isInternship?: boolean;
  includeExpired?: boolean;
};

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseJobListQuery(req: Request): JobListQuery {
  const q = req.query;
  return {
    search: q.search ? String(q.search) : undefined,
    location: q.location ? String(q.location) : undefined,
    category: q.category ? String(q.category) : undefined,
    posterType: q.posterType ? String(q.posterType) : undefined,
    jobType: q.jobType ? String(q.jobType) : undefined,
    experienceLevel: q.experienceLevel ? String(q.experienceLevel) : undefined,
    educationLevel: q.educationLevel ? String(q.educationLevel) : undefined,
    scrapedFrom: q.scrapedFrom ? String(q.scrapedFrom) : undefined,
    isRemote: q.isRemote !== undefined ? String(q.isRemote).toLowerCase() === "true" : undefined,
    isInternship:
      q.isInternship !== undefined ? String(q.isInternship).toLowerCase() === "true" : undefined,
    includeExpired:
      q.includeExpired !== undefined ? String(q.includeExpired).toLowerCase() === "true" : undefined,
  };
}

export function buildJobWhere(
  query: JobListQuery,
  omit: Array<keyof JobListQuery> = []
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (!omit.includes("search") && query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { company: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (!omit.includes("location") && query.location) {
    where.normalizedLocation = {
      contains: query.location.toLowerCase(),
      mode: "insensitive",
    };
  }
  if (!omit.includes("category") && query.category) {
    where.category = { equals: query.category, mode: "insensitive" };
  }
  if (!omit.includes("posterType") && query.posterType) {
    where.posterType = { equals: query.posterType, mode: "insensitive" };
  }
  if (!omit.includes("jobType") && query.jobType) {
    where.jobType = { equals: query.jobType, mode: "insensitive" };
  }
  if (!omit.includes("experienceLevel") && query.experienceLevel) {
    where.experienceLevel = { equals: query.experienceLevel, mode: "insensitive" };
  }
  if (!omit.includes("educationLevel") && query.educationLevel) {
    where.educationLevel = { equals: query.educationLevel, mode: "insensitive" };
  }
  if (!omit.includes("scrapedFrom") && query.scrapedFrom) {
    where.scrapedFrom = { contains: query.scrapedFrom, mode: "insensitive" };
  }
  if (!omit.includes("isRemote") && query.isRemote !== undefined) {
    where.isRemote = query.isRemote;
  }
  if (!omit.includes("isInternship") && query.isInternship !== undefined) {
    where.isInternship = query.isInternship;
  }
  if (!query.includeExpired) {
    where.isExpired = false;
  }

  return where;
}

export type FacetOption = { value: string; count: number };

async function facetGroup(
  field: "category" | "posterType" | "jobType" | "experienceLevel" | "educationLevel",
  baseWhere: Record<string, unknown>
): Promise<FacetOption[]> {
  const rows = await prisma.job.groupBy({
    by: [field],
    where: { ...baseWhere, [field]: { not: null } },
    _count: { _all: true },
  });

  return rows
    .filter((r) => r[field])
    .map((r) => ({
      value: r[field] as string,
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

async function facetScrapeSites(baseWhere: Record<string, unknown>): Promise<FacetOption[]> {
  const rows = await prisma.job.findMany({
    where: { ...baseWhere, scrapedFrom: { not: null } },
    select: { scrapedFrom: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.scrapedFrom) continue;
    for (const part of row.scrapedFrom.split(",")) {
      const site = part.trim();
      if (!site) continue;
      counts.set(site, (counts.get(site) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export async function getJobMeta(query: JobListQuery) {
  const today = startOfToday();
  const activeWhere = { isExpired: false };
  const filteredWhere = buildJobWhere(query);

  const [
    totalActive,
    globalPostedToday,
    filteredTotal,
    filteredPostedToday,
    categories,
    posterTypes,
    jobTypes,
    experienceLevels,
    educationLevels,
    scrapeSites,
  ] = await Promise.all([
    prisma.job.count({ where: activeWhere }),
    prisma.job.count({
      where: { ...activeWhere, postedAt: { gte: today } },
    }),
    prisma.job.count({ where: filteredWhere }),
    prisma.job.count({
      where: { ...filteredWhere, postedAt: { gte: today } },
    }),
    facetGroup("category", buildJobWhere(query, ["category"])),
    facetGroup("posterType", buildJobWhere(query, ["posterType"])),
    facetGroup("jobType", buildJobWhere(query, ["jobType"])),
    facetGroup("experienceLevel", buildJobWhere(query, ["experienceLevel"])),
    facetGroup("educationLevel", buildJobWhere(query, ["educationLevel"])),
    facetScrapeSites(buildJobWhere(query, ["scrapedFrom"])),
  ]);

  return {
    global: { totalActive, postedToday: globalPostedToday },
    filtered: { total: filteredTotal, postedToday: filteredPostedToday },
    facets: {
      categories,
      posterTypes,
      jobTypes,
      experienceLevels,
      educationLevels,
      scrapeSites,
    },
  };
}
