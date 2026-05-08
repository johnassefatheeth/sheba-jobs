import { createHash } from "node:crypto";

export type RawJobRow = {
  title: string;
  company?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  applyUrl?: string | null;
  postedAt?: Date | null;
  sourceUrl: string;
  rawSource?: string | null;
  expiresAt?: Date | null;
  isExpired?: boolean;
};

export type EnrichedJobRow = RawJobRow & {
  normalizedTitle: string | null;
  normalizedCompany: string | null;
  normalizedLocation: string | null;
  normalizedCategory: string | null;
  posterType: string | null;
  jobType: string | null;
  experienceLevel: string | null;
  educationLevel: string | null;
  isRemote: boolean;
  isInternship: boolean;
  canonicalKey: string;
  expiresAt: Date | null;
  isExpired: boolean;
};

const COMPANY_SUFFIX_RE =
  /\b(share company|s\.?c\.?|plc|p\.?l\.?c\.?|ltd|limited|inc|corp|corporation|co\.?|group|international|int'l)\b/gi;

const CATEGORY_ALIASES: Record<string, string> = {
  finance: "Finance",
  accounting: "Finance",
  banking: "Banking",
  engineering: "Engineering",
  software: "Information Technology",
  it: "Information Technology",
  "information technology": "Information Technology",
  health: "Healthcare",
  medical: "Healthcare",
  ngo: "NGO",
  airline: "Aviation",
  aviation: "Aviation",
  sales: "Sales",
  marketing: "Marketing",
  hr: "Human Resources",
  "human resource": "Human Resources",
  logistics: "Logistics",
  internship: "Internship",
  intern: "Internship",
};

function compactSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function htmlToText(value: string): string {
  if (!value) return "";
  const withBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, "\n")
    .replace(/<\/ul>|<\/ol>|<\/table>/gi, "\n\n");
  const noTags = withBreaks.replace(/<[^>]+>/g, " ");
  return noTags
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = compactSpaces(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\b(job|jobs|vacancy|vacancies|position|opening|opportunity)\b/g, " ")
  );
  return clean || null;
}

function normalizeCompany(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = compactSpaces(value.replace(COMPANY_SUFFIX_RE, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").toLowerCase());
  return clean || null;
}

function normalizeCategory(category: string | null | undefined, title: string, description: string): string {
  const source = [category ?? "", title, description.slice(0, 800)].join(" ").toLowerCase();
  for (const [needle, normalized] of Object.entries(CATEGORY_ALIASES)) {
    if (source.includes(needle)) return normalized;
  }
  return "General";
}

function classifyPosterType(company: string | null | undefined, title: string, description: string): string {
  const hay = [company ?? "", title, description].join(" ").toLowerCase();
  if (/\b(bank|microfinance)\b/.test(hay)) return "Bank";
  if (/\b(ngo|foundation|unicef|undp|charity|international organization)\b/.test(hay)) return "NGO";
  if (/\b(airlines?|aviation|airport)\b/.test(hay)) return "Airlines";
  if (/\b(ministry|authority|government|gov|public service|municipal)\b/.test(hay)) return "Government";
  if (/\b(university|college|school|hospital)\b/.test(hay)) return "Institution";
  return "Private";
}

function classifyJobType(title: string, description: string): { jobType: string; isRemote: boolean; isInternship: boolean } {
  const hay = `${title} ${description}`.toLowerCase();
  const isInternship = /\b(intern|internship|graduate trainee|fresh graduate)\b/.test(hay);
  const isRemote = /\b(remote|work from home|wfh|home[- ]based)\b/.test(hay);
  let jobType = "General";
  if (/\b(developer|engineer|software|it support|data|qa)\b/.test(hay)) jobType = "IT";
  else if (/\b(accounting|finance|auditor|bank)\b/.test(hay)) jobType = "Finance";
  else if (/\b(marketing|sales|business development)\b/.test(hay)) jobType = "Sales & Marketing";
  else if (/\b(nurse|doctor|medical|health)\b/.test(hay)) jobType = "Healthcare";
  if (isInternship) jobType = "Internship";
  return { jobType, isRemote, isInternship };
}

function extractExperienceLevel(title: string, description: string): string | null {
  const hay = `${title}\n${description}`;
  if (/\b(no experience|0 years?|fresh graduate)\b/i.test(hay)) return "Entry";
  const yearMatch = hay.match(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (years <= 1) return "Entry";
    if (years <= 3) return "Junior";
    if (years <= 6) return "Mid";
    return "Senior";
  }
  if (/\b(senior|lead|principal|manager)\b/i.test(hay)) return "Senior";
  if (/\b(junior|associate)\b/i.test(hay)) return "Junior";
  return null;
}

function extractEducationLevel(title: string, description: string): string | null {
  const hay = `${title}\n${description}`.toLowerCase();
  if (/\b(phd|doctorate)\b/.test(hay)) return "PhD";
  if (/\b(master|msc|ma|mba)\b/.test(hay)) return "Masters";
  if (/\b(bachelor|bsc|ba|degree)\b/.test(hay)) return "Bachelors";
  if (/\b(diploma|level iii|level iv|tvet|certificate)\b/.test(hay)) return "Diploma/Certificate";
  return null;
}

function extractExpiresAt(description: string): Date | null {
  const match = description.match(/\b(deadline|closing date|application deadline)\s*[:\-]\s*([^\n]+)/i);
  if (!match) return null;
  const parsed = new Date(match[2].trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildCanonicalKey(normalizedTitle: string | null, normalizedCompany: string | null, normalizedLocation: string | null): string {
  const payload = `${normalizedTitle ?? "unknown"}|${normalizedCompany ?? "unknown"}|${normalizedLocation ?? "unknown"}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 40);
}

export function enrichJobRow(row: RawJobRow): EnrichedJobRow {
  const description = htmlToText(row.description ?? "");
  const normalizedTitle = normalizeToken(row.title);
  const normalizedCompany = normalizeCompany(row.company);
  const normalizedLocation = normalizeToken(row.location);
  const normalizedCategory = normalizeCategory(row.category, row.title, description);
  const posterType = classifyPosterType(row.company, row.title, description);
  const { jobType, isRemote, isInternship } = classifyJobType(row.title, description);
  const experienceLevel = extractExperienceLevel(row.title, description);
  const educationLevel = extractEducationLevel(row.title, description);
  const extractedExpiresAt = row.expiresAt ?? extractExpiresAt(description);
  const now = Date.now();
  const isExpired = Boolean(row.isExpired || (extractedExpiresAt && extractedExpiresAt.getTime() < now));
  const canonicalKey = buildCanonicalKey(normalizedTitle, normalizedCompany, normalizedLocation);

  return {
    ...row,
    description,
    category: normalizedCategory,
    normalizedTitle,
    normalizedCompany,
    normalizedLocation,
    normalizedCategory,
    posterType,
    jobType,
    experienceLevel,
    educationLevel,
    isRemote,
    isInternship,
    canonicalKey,
    expiresAt: extractedExpiresAt,
    isExpired,
  };
}
