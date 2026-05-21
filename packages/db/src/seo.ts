type JobSeoInput = {
  title: string;
  company?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  slug: string;
};

function compactText(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function buildJobSeoTitle(job: JobSeoInput): string {
  const company = job.company?.trim();
  const location = job.location?.trim();
  const parts = [job.title.trim()];
  if (company) parts.push(`at ${company}`);
  if (location) parts.push(`in ${location}`);
  return `${parts.join(" ")} | Sheba Jobs Ethiopia`;
}

export function buildJobSeoDescription(job: JobSeoInput): string {
  const description = job.description?.trim();
  if (description) {
    return compactText(description, 160);
  }
  const bits = [
    job.title.trim(),
    job.company?.trim(),
    job.location?.trim(),
    job.category?.trim(),
    "Apply on Sheba Jobs Ethiopia.",
  ].filter(Boolean);
  return compactText(bits.join(" · "), 160);
}

export function buildJobCanonicalPath(slug: string): string {
  return `/jobs/${slug}`;
}
