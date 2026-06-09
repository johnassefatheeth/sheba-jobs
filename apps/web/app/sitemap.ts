import type { MetadataRoute } from "next";
import { buildJobCanonicalPath, getSiteUrl } from "../lib/jobSeo";

type JobListItem = {
  slug?: string | null;
  id: string;
  postedAt?: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  let jobs: JobListItem[] = [];

  try {
    const res = await fetch(`${apiBase}/jobs?limit=500&legacy=array`, { next: { revalidate: 3600 } });
    const data = res.ok ? await res.json() : [];
    jobs = Array.isArray(data) ? data : data.jobs ?? [];
  } catch {
    jobs = [];
  }

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    ...jobs.map((job) => ({
      url: `${siteUrl}${buildJobCanonicalPath(job.slug || job.id)}`,
      lastModified: job.postedAt ? new Date(job.postedAt) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
