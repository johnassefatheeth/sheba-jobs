import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  buildJobCanonicalPath,
  buildJobSeoDescription,
  buildJobSeoTitle,
  getSiteUrl,
} from "../../../lib/jobSeo";

type Job = {
  id: string;
  slug?: string | null;
  title: string;
  company?: string;
  location?: string;
  category?: string;
  description?: string;
  applyUrl?: string;
  scrapedFrom?: string;
  postedAt?: string;
  freshness?: string;
  isExpired?: boolean;
  expiresAt?: string;
  jobType?: string;
  posterType?: string;
  experienceLevel?: string;
  educationLevel?: string;
  isRemote?: boolean;
  isInternship?: boolean;
};

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

async function getJob(slug: string): Promise<Job | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const res = await fetch(`${apiBase}/jobs/${encodeURIComponent(slug)}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const job = await getJob(params.slug);
  if (!job) {
    return { title: "Job not found | Sheba Jobs Ethiopia" };
  }

  const slug = job.slug || params.slug;
  const title = buildJobSeoTitle({ ...job, slug });
  const description = buildJobSeoDescription({ ...job, slug });
  const canonicalPath = buildJobCanonicalPath(slug);
  const siteUrl = getSiteUrl();
  const canonicalUrl = `${siteUrl}${canonicalPath}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Sheba Jobs Ethiopia",
      type: "article",
      locale: "en_ET",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: job.isExpired ? { index: false, follow: true } : { index: true, follow: true },
  };
}

function buildJobPostingJsonLd(job: Job, canonicalUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.postedAt,
    validThrough: job.expiresAt,
    hiringOrganization: job.company
      ? { "@type": "Organization", name: job.company }
      : undefined,
    jobLocation: job.location
      ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } }
      : undefined,
    employmentType: job.jobType,
    directApply: Boolean(job.applyUrl),
    url: canonicalUrl,
    identifier: {
      "@type": "PropertyValue",
      name: "Sheba Jobs Ethiopia",
      value: job.id,
    },
  };
}

export default async function JobPage({ params }: { params: { slug: string } }) {
  const job = await getJob(params.slug);
  if (!job) notFound();

  const slug = job.slug || params.slug;
  const canonicalUrl = `${getSiteUrl()}${buildJobCanonicalPath(slug)}`;
  const description = job.description ?? "";
  const hasHtml = /<[^>]+>/.test(description);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJobPostingJsonLd(job, canonicalUrl)) }}
      />
      <h2>{job.title}</h2>
      <div>{job.company} • {job.location}</div>
      <div style={{ marginTop: ".35rem", color: "var(--muted)" }}>
        {job.freshness || "—"}
        {job.category ? ` • Field: ${job.category}` : ""}
      </div>
      <div style={{ marginTop: ".25rem", fontSize: ".9rem", color: "var(--muted)" }}>
        {job.posterType ? `Employer: ${job.posterType}` : ""}
        {job.jobType ? ` • ${job.jobType}` : ""}
        {job.experienceLevel ? ` • ${job.experienceLevel}` : ""}
        {job.educationLevel ? ` • ${job.educationLevel}` : ""}
        {job.isRemote ? " • Remote" : ""}
      </div>
      {job.scrapedFrom && (
        <p style={{ marginTop: ".5rem", fontSize: ".9rem", color: "#0f766e" }}>
          Scraped from: {job.scrapedFrom}
        </p>
      )}
      {job.isExpired && (
        <p style={{ marginTop: ".5rem", color: "#b91c1c", fontWeight: 600 }}>This job has expired.</p>
      )}
      {hasHtml ? (
        <div style={{ marginTop: "1rem" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }} />
      ) : (
        <p style={{ whiteSpace: "pre-wrap", marginTop: "1rem" }}>{description}</p>
      )}
      {job.applyUrl && (
        <div style={{ marginTop: "1rem" }}>
          <a className="apply-btn" href={job.applyUrl} target="_blank" rel="noreferrer">
            Apply
          </a>
        </div>
      )}
    </article>
  );
}
