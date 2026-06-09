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
  { label: "NGO & Development", re: /\b(program officer|project coordinator|monitoring|evaluation|mel officer|development worker|humanitarian)\b/i, weight: 3 },
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

function mapSourceCategory(category: string | null | undefined): string | null {
  if (!category?.trim()) return null;
  const key = category.trim().toLowerCase();
  if (SOURCE_CATEGORY_MAP[key]) return SOURCE_CATEGORY_MAP[key];
  for (const [needle, label] of Object.entries(SOURCE_CATEGORY_MAP)) {
    if (key.includes(needle)) return label;
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

  for (const [label, score] of scoreField(title, 3)) {
    scores.set(label, (scores.get(label) ?? 0) + score);
  }
  if (mapped) {
    scores.set(mapped, (scores.get(mapped) ?? 0) + 4);
  }
  if (company) {
    for (const [label, score] of scoreField(company, 1)) {
      scores.set(label, (scores.get(label) ?? 0) + score);
    }
  }
  const descSample = description.slice(0, 1200);
  for (const [label, score] of scoreField(descSample, 1)) {
    scores.set(label, (scores.get(label) ?? 0) + score);
  }

  const inferred = pickBestField(scores);

  if (mapped && inferred === "General") return mapped;
  if (mapped && scores.get(inferred)! < (scores.get(mapped) ?? 0) + 2) return mapped;

  return inferred;
}

/** Who is hiring — employer sector, not the job board (`scrapedFrom`). */
function classifyPosterType(company: string | null | undefined, title: string, description: string): string {
  const hay = [company ?? "", title, description.slice(0, 600)].join(" ").toLowerCase();

  if (/\b(invitation to bid|request for proposal|rfp|rfq|tender|expression of interest|eoi|procurement notice)\b/.test(hay)) {
    return "Procurement / Tender";
  }
  if (/\b(bank of |commercial bank|microfinance|micro finance)\b/.test(hay) || /\b(bank|microfinance)\b/.test(company ?? "")) {
    return "Bank";
  }
  if (/\b(ngo|foundation|stiftung|unicef|undp|charity|non[\s-]?profit|international organization|consortium)\b/.test(hay)) {
    return "NGO";
  }
  if (/\b(airlines?|aviation|airport|ethiopian airlines)\b/.test(hay)) return "Airlines";
  if (/\b(ministry|authority|government|gov\b|public service|municipal|bureau)\b/.test(hay)) return "Government";
  if (/\b(university|college|school|hospital|clinic)\b/.test(hay)) return "Institution";
  return "Private Company";
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

export function enrichJobRow(row: RawJobRow): EnrichedJobRow {
  const description = htmlToText(row.description ?? "");
  const normalizedTitle = normalizeToken(row.title);
  const normalizedCompany = normalizeCompany(row.company);
  const normalizedLocation = normalizeToken(row.location);
  const category = inferField(row.category, row.title, row.company, description);
  const posterType = classifyPosterType(row.company, row.title, description);
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
  };
}
