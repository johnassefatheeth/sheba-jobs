import { notFound, redirect } from "next/navigation";
import { buildJobCanonicalPath } from "../../../../lib/jobSeo";

async function getJob(id: string) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${apiBase}/jobs/${encodeURIComponent(id)}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ slug?: string | null; id: string }>;
}

export default async function LegacyJobPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  if (!job) notFound();
  redirect(buildJobCanonicalPath(job.slug || job.id));
}
