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
  /** Provider-native employer sector hint (e.g. Afriwork entity.type). */
  posterTypeHint?: string | null;
  companyLogoUrl?: string | null;
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
  companyLogoUrl: string | null;
};

const COMPANY_SUFFIX_RE =
  /\b(share company|s\.?c\.?|plc|p\.?l\.?c\.?|ltd|limited|inc|corp|corporation|co\.?|group|international|int'l)\b/gi;

/** Industry / field — shown as `category` in the DB and UI. */
const FIELD_RULES: { label: string; re: RegExp; weight: number }[] = [
  { label: "Procurement & Supply Chain", re: /\b(procurement|purchasing|supply chain|warehouse|inventory|storekeeper|buyer)\b/i, weight: 5 },
  { label: "Logistics & Transport", re: /\b(logistics|fleet|dispatch|courier|freight|shipping|driver|transport)\b/i, weight: 4 },
  { label: "Civil & Construction", re: /\b(civil engineer|site engineer|structural|construction|surveyor|architect|building|contractor)\b/i, weight: 5 },
  { label: "Mechanical & Electrical", re: /\b(mechanical engineer|electrical engineer|hvac|maintenance technician|technician)\b/i, weight: 4 },
  { label: "Engineering", re: /\bengineer\b/i, weight: 2 },
  { label: "Software & IT", re: /\b(software|developer|programmer|full[\s-]?stack|backend|frontend|devops|data scientist|cyber\s*security|it support|system admin|network admin|ui\/ux)\b/i, weight: 5 },
  { label: "Software & IT", re: /\b(computer science|information technology|informatics)\b/i, weight: 3 },
  { label: "Accounting & Audit", re: /\b(accountant|accounting|auditor|audit|bookkeeper|payroll)\b/i, weight: 5 },
  { label: "Finance & Investment", re: /\b(finance|financial|treasury|investment|budget|controller)\b/i, weight: 4 },
  { label: "Banking & Insurance", re: /\b(bank teller|loan officer|credit officer|branch manager|microfinance|insurance|underwriter)\b/i, weight: 5 },
  { label: "Healthcare & Nursing", re: /\b(nurse|midwife|health officer|clinical|patient care)\b/i, weight: 5 },
  { label: "Medical & Pharmacy", re: /\b(doctor|physician|medical|pharmacist|dentist|lab technician|radiology)\b/i, weight: 5 },
  { label: "Human Resources", re: /\b(human resource|hr officer|recruiter|talent acquisition|people operations|compensation)\b/i, weight: 5 },
  { label: "Sales", re: /\b(sales representative|sales officer|sales agent|sales executive|business development)\b/i, weight: 4 },
  { label: "Marketing & Communications", re: /\b(marketing|brand|communication|public relation|social media|content creator|graphic design)\b/i, weight: 4 },
  { label: "Education & Training", re: /\b(teacher|lecturer|professor|tutor|principal|academic|trainer|instructor|curriculum)\b/i, weight: 5 },
  { label: "Legal & Compliance", re: /\b(lawyer|legal|attorney|paralegal|compliance|regulatory)\b/i, weight: 5 },
  { label: "Aviation", re: /\b(pilot|flight attendant|cabin crew|airline|aviation|airport|ground handling)\b/i, weight: 5 },
  { label: "Hospitality & Tourism", re: /\b(chef|cook|waiter|waitress|hotel|hospitality|front desk|housekeeping|tour guide|tourism)\b/i, weight: 4 },
  { label: "Agriculture & Environment", re: /\b(agronomist|agriculture|livestock|farming|veterinary|environment|forestry|natural resource)\b/i, weight: 4 },
  { label: "Manufacturing & Production", re: /\b(production|manufacturing|factory|plant operator|quality control|qc officer)\b/i, weight: 4 },
  { label: "Mining & Energy", re: /\b(mining|petroleum|oil and gas|energy|geologist|drilling)\b/i, weight: 4 },
  { label: "Real Estate & Property", re: /\b(real estate|property|facility|estate agent|leasing)\b/i, weight: 4 },
  { label: "Security & Safety", re: /\b(security guard|safety officer|hse|occupational health)\b/i, weight: 4 },
  { label: "Customer Service & Call Center", re: /\b(customer service|call center|help desk|client support)\b/i, weight: 4 },
  { label: "NGO & Development", re: /\b(program coordinator|program officer|project coordinator|monitoring|evaluation|mel officer|development worker|humanitarian)\b/i, weight: 5 },
  { label: "Human Resources", re: /\b(hr manager|hr and|human resources?)\b/i, weight: 5 },
  { label: "Research & Sciences", re: /\b(research|scientist|laboratory|lab analyst|biologist|chemist)\b/i, weight: 3 },
  { label: "Media & Journalism", re: /\b(journalist|reporter|editor|media|broadcast|videographer|photographer)\b/i, weight: 4 },
  { label: "Retail & Merchandising", re: /\b(retail|merchandiser|shop attendant|cashier|store manager)\b/i, weight: 4 },
  { label: "Administration & Office", re: /\b(administrative|office manager|secretary|receptionist|executive assistant|clerical|data entry)\b/i, weight: 3 },
  { label: "Management & Leadership", re: /\b(general manager|managing director|chief|head of|director|supervisor)\b/i, weight: 2 },
  { label: "Consulting & Tender", re: /\b(consultant|consultancy|invitation to bid|tender|rfp|rfq|expression of interest)\b/i, weight: 4 },
];

const SOURCE_CATEGORY_MAP: Record<string, string> = {
  finance: "Finance & Investment",
  accounting: "Accounting & Audit",
  audit: "Accounting & Audit",
  banking: "Banking & Insurance",
  bank: "Banking & Insurance",
  insurance: "Banking & Insurance",
  engineering: "Engineering",
  civil: "Civil & Construction",
  construction: "Civil & Construction",
  mechanical: "Mechanical & Electrical",
  electrical: "Mechanical & Electrical",
  software: "Software & IT",
  "information technology": "Software & IT",
  it: "Software & IT",
  technology: "Software & IT",
  health: "Healthcare & Nursing",
  healthcare: "Healthcare & Nursing",
  medical: "Medical & Pharmacy",
  nursing: "Healthcare & Nursing",
  ngo: "NGO & Development",
  "non profit": "NGO & Development",
  nonprofit: "NGO & Development",
  development: "NGO & Development",
  airline: "Aviation",
  aviation: "Aviation",
  sales: "Sales",
  marketing: "Marketing & Communications",
  communication: "Marketing & Communications",
  hr: "Human Resources",
  "human resource": "Human Resources",
  logistics: "Logistics & Transport",
  transport: "Logistics & Transport",
  procurement: "Procurement & Supply Chain",
  supply: "Procurement & Supply Chain",
  legal: "Legal & Compliance",
  education: "Education & Training",
  training: "Education & Training",
  hospitality: "Hospitality & Tourism",
  tourism: "Hospitality & Tourism",
  agriculture: "Agriculture & Environment",
  environment: "Agriculture & Environment",
  manufacturing: "Manufacturing & Production",
  production: "Manufacturing & Production",
  mining: "Mining & Energy",
  energy: "Mining & Energy",
  "real estate": "Real Estate & Property",
  property: "Real Estate & Property",
  security: "Security & Safety",
  customer: "Customer Service & Call Center",
  retail: "Retail & Merchandising",
  media: "Media & Journalism",
  research: "Research & Sciences",
  administration: "Administration & Office",
  admin: "Administration & Office",
  management: "Management & Leadership",
  consulting: "Consulting & Tender",
};

/** Short map keys must match whole words — avoids "Administration" → Software & IT via "it". */
const SOURCE_CATEGORY_WORD_KEYS = new Set(["it", "hr", "admin", "bank", "ngo", "sales", "legal", "energy", "health", "supply"]);

const PRIVATE_COMPANY_NAME_RE =
  /\b(trading|import|export|manufacturing|industries|holdings|investment|construction|contractors?|distillers?|brewery|breweries|farms?|agro|textile|garment|pharma|pharmaceutical)\b/i;

const PRIVATE_LEGAL_FORM_RE = /\b(plc|p\.?l\.?c\.?|ltd|limited|share company|s\.?c\.?)\b/i;

const BANK_COMPANY_RE = /\b(bank|microfinance|micro[\s-]?finance)\b/i;

const NGO_COMPANY_RE =
  /\b(ngo|foundation|charity|non[\s-]?profit|childfund|world vision|save the children|care international|plan international|oxfam|action aid|concern worldwide|tearfund|compassion|unicef|undp|unhcr|wfp|who|fhi\s*360|pathfinder|pact|international medical corps)\b/i;

const GOVERNMENT_COMPANY_RE =
  /\b(ministry|federal|bureau|authority|commission|municipality|city administration|regional state|public enterprise|state-owned|government)\b/i;

function compactSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function htmlToText(value: string): string {
  if (!value) return "";
  const withBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
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

function sourceCategoryKeyMatches(key: string, needle: string): boolean {
  if (key === needle) return true;
  if (SOURCE_CATEGORY_WORD_KEYS.has(needle)) {
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(key);
  }
  return key.includes(needle);
}

function mapSourceCategory(category: string | null | undefined): string | null {
  if (!category?.trim()) return null;
  const key = category.trim().toLowerCase();
  if (SOURCE_CATEGORY_MAP[key]) return SOURCE_CATEGORY_MAP[key];
  for (const [needle, label] of Object.entries(SOURCE_CATEGORY_MAP)) {
    if (sourceCategoryKeyMatches(key, needle)) return label;
  }
  return category.trim();
}

function scoreField(text: string, weightMultiplier: number): Map<string, number> {
  const scores = new Map<string, number>();
  for (const rule of FIELD_RULES) {
    if (rule.re.test(text)) {
      scores.set(rule.label, (scores.get(rule.label) ?? 0) + rule.weight * weightMultiplier);
    }
  }
  return scores;
}

function pickBestField(scores: Map<string, number>): string {
  let best = "General";
  let bestScore = 0;
  for (const [label, score] of scores) {
    if (score > bestScore) {
      best = label;
      bestScore = score;
    }
  }
  return best;
}

function inferField(
  sourceCategory: string | null | undefined,
  title: string,
  company: string | null | undefined,
  description: string
): string {
  const mapped = mapSourceCategory(sourceCategory);
  const scores = new Map<string, number>();

  const titleScores = scoreField(title, 3);
  for (const [label, score] of titleScores) {
    scores.set(label, (scores.get(label) ?? 0) + score);
  }
  const titleBest = pickBestField(titleScores);
  const titleBestScore = titleScores.get(titleBest) ?? 0;

  if (mapped) {
    const sourceBonus = titleBestScore >= 9 && titleBest !== mapped ? 1 : 3;
    scores.set(mapped, (scores.get(mapped) ?? 0) + sourceBonus);
  }
  if (company) {
    for (const [label, score] of scoreField(company, 1)) {
      scores.set(label, (scores.get(label) ?? 0) + score);
    }
  }
  const descSample = description.slice(0, 800);
  for (const [label, score] of scoreField(descSample, 1)) {
    scores.set(label, (scores.get(label) ?? 0) + score);
  }

  const inferred = pickBestField(scores);
  const inferredScore = scores.get(inferred) ?? 0;
  const mappedScore = mapped ? (scores.get(mapped) ?? 0) : 0;

  if (titleBestScore >= 9 && titleBest !== "General") {
    if (inferred !== titleBest && titleBestScore >= inferredScore - 2) return titleBest;
  }

  if (mapped && inferred === "General") return mapped;
  if (mapped && inferredScore < mappedScore + 1) return mapped;

  return inferred;
}

function mapPosterTypeHint(hint: string | null | undefined): string | null {
  if (!hint?.trim()) return null;
  const key = hint.trim().toLowerCase();
  if (/\b(bank|microfinance)\b/.test(key)) return "Bank";
  if (/\b(ngo|non[\s-]?profit|charity|foundation|cso)\b/.test(key)) return "NGO";
  if (/\b(government|public|ministry|state)\b/.test(key)) return "Government";
  if (/\b(airline|aviation)\b/.test(key)) return "Airlines";
  if (/\b(university|college|school|hospital|institution)\b/.test(key)) return "Institution";
  if (/\b(private|company|corporate|business)\b/.test(key)) return "Private Company";
  return null;
}

/** Who is hiring — employer sector, not the job board (`scrapedFrom`). */
function classifyPosterType(
  company: string | null | undefined,
  title: string,
  description: string,
  posterTypeHint?: string | null
): string {
  const companyHay = (company ?? "").toLowerCase();
  const titleHay = title.toLowerCase();
  const headHay = `${companyHay} ${titleHay}`;

  if (/\b(invitation to bid|request for proposal|rfp|rfq|tender|expression of interest|eoi|procurement notice)\b/.test(headHay)) {
    return "Procurement / Tender";
  }

  if (BANK_COMPANY_RE.test(companyHay) || /\b(bank of |commercial bank)\b/.test(companyHay)) {
    return "Bank";
  }
  if (NGO_COMPANY_RE.test(companyHay)) return "NGO";
  if (GOVERNMENT_COMPANY_RE.test(companyHay) && !PRIVATE_LEGAL_FORM_RE.test(companyHay)) {
    return "Government";
  }
  if (PRIVATE_LEGAL_FORM_RE.test(companyHay) || PRIVATE_COMPANY_NAME_RE.test(companyHay)) {
    return "Private Company";
  }

  const hinted = mapPosterTypeHint(posterTypeHint);
  if (hinted) return hinted;

  if (BANK_COMPANY_RE.test(titleHay) || /\b(banking systems?|core banking)\b/.test(titleHay)) {
    return "Bank";
  }
  if (NGO_COMPANY_RE.test(titleHay)) return "NGO";
  if (GOVERNMENT_COMPANY_RE.test(titleHay)) return "Government";
  if (/\b(airlines?|aviation|airport|ethiopian airlines)\b/.test(headHay)) return "Airlines";
  if (/\b(university|college|school|hospital|clinic)\b/.test(headHay)) return "Institution";

  const descHay = description.slice(0, 300).toLowerCase();
  if (NGO_COMPANY_RE.test(descHay) && !PRIVATE_LEGAL_FORM_RE.test(companyHay)) return "NGO";

  return "Private Company";
}

function reconcileLabels(
  posterType: string,
  category: string,
  company: string | null | undefined,
  title: string
): { posterType: string; category: string } {
  const companyHay = (company ?? "").toLowerCase();
  let nextPoster = posterType;
  let nextCategory = category;

  if (BANK_COMPANY_RE.test(companyHay)) {
    nextPoster = "Bank";
    if (!/bank|insurance|finance/i.test(nextCategory)) {
      nextCategory = "Banking & Insurance";
    }
  }

  if (NGO_COMPANY_RE.test(companyHay)) {
    nextPoster = "NGO";
  }

  if (
    nextPoster === "Government" &&
    (PRIVATE_LEGAL_FORM_RE.test(companyHay) || PRIVATE_COMPANY_NAME_RE.test(companyHay))
  ) {
    nextPoster = "Private Company";
  }

  if (nextPoster === "Private Company" && GOVERNMENT_COMPANY_RE.test(companyHay) && !PRIVATE_LEGAL_FORM_RE.test(companyHay)) {
    nextPoster = "Government";
  }

  if (/\b(audit service|external audit)\b/i.test(title) && nextCategory === "General") {
    nextCategory = "Accounting & Audit";
  }

  return { posterType: nextPoster, category: nextCategory };
}

/** Employment arrangement — distinct from industry `category`. */
function classifyEmploymentType(title: string, description: string): {
  jobType: string;
  isRemote: boolean;
  isInternship: boolean;
} {
  const hay = `${title} ${description.slice(0, 800)}`.toLowerCase();
  const isInternship = /\b(intern|internship|graduate trainee)\b/.test(hay);
  const isRemote = /\b(remote|work from home|wfh|home[\s-]?based)\b/.test(hay);

  let jobType = "Full-time";
  if (isInternship) jobType = "Internship";
  else if (/\b(project[\s-]?based|fixed[\s-]?term project)\b/.test(hay)) jobType = "Project-based";
  else if (/\b(consultant|consultancy|freelance|contractor)\b/.test(hay)) jobType = "Consultancy";
  else if (/\b(part[\s-]?time)\b/.test(hay)) jobType = "Part-time";
  else if (/\b(contract|temporary|temp)\b/.test(hay)) jobType = "Contract";
  else if (/\b(volunteer|voluntary)\b/.test(hay)) jobType = "Volunteer";

  return { jobType, isRemote, isInternship };
}

function extractExperienceLevel(title: string, description: string): string | null {
  const titleHay = title.toLowerCase();
  if (/\b(senior|sr\.|lead|principal|head of|manager|director|chief)\b/.test(titleHay)) return "Senior";
  if (/\b(junior|jr\.|associate|assistant)\b/.test(titleHay)) return "Junior";
  if (/\b(mid|intermediate)\b/.test(titleHay)) return "Mid";
  if (/\b(entry|graduate|fresh)\b/.test(titleHay)) return "Entry";

  const hay = `${title}\n${description.slice(0, 1500)}`;
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
  const hay = `${title}\n${description.slice(0, 1500)}`.toLowerCase();
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

const DEFAULT_LOGO_CDN_BASE = "https://ethiojobs.net";

export function normalizeLogoUrl(
  raw?: string | null,
  options?: { cdnBase?: string }
): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  const cdnBase = (options?.cdnBase ?? process.env.COMPANY_LOGO_CDN_BASE ?? DEFAULT_LOGO_CDN_BASE).replace(
    /\/$/,
    ""
  );

  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${cdnBase}${value}`;
  if (/^(company-logo|uploads|storage|media)\//i.test(value)) return `${cdnBase}/${value}`;
  return null;
}

export function enrichJobRow(row: RawJobRow): EnrichedJobRow {
  const description = htmlToText(row.description ?? "");
  const normalizedTitle = normalizeToken(row.title);
  const normalizedCompany = normalizeCompany(row.company);
  const normalizedLocation = normalizeToken(row.location);
  let category = inferField(row.category, row.title, row.company, description);
  let posterType = classifyPosterType(row.company, row.title, description, row.posterTypeHint);
  ({ posterType, category } = reconcileLabels(posterType, category, row.company, row.title));
  const { jobType, isRemote, isInternship } = classifyEmploymentType(row.title, description);
  const experienceLevel = extractExperienceLevel(row.title, description);
  const educationLevel = extractEducationLevel(row.title, description);
  const extractedExpiresAt = row.expiresAt ?? extractExpiresAt(description);
  const now = Date.now();
  const isExpired = Boolean(row.isExpired || (extractedExpiresAt && extractedExpiresAt.getTime() < now));
  const canonicalKey = buildCanonicalKey(normalizedTitle, normalizedCompany, normalizedLocation);

  return {
    ...row,
    description,
    category,
    normalizedTitle,
    normalizedCompany,
    normalizedLocation,
    normalizedCategory: normalizeToken(category),
    posterType,
    jobType,
    experienceLevel,
    educationLevel,
    isRemote,
    isInternship,
    canonicalKey,
    expiresAt: extractedExpiresAt,
    isExpired,
    companyLogoUrl: normalizeLogoUrl(row.companyLogoUrl),
  };
}
