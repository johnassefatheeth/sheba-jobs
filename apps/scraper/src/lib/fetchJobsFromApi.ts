import { detectJobsArray, getByPath } from "./getByPath.js";

export type FieldMap = Partial<
  Record<
    | "title"
    | "company"
    | "location"
    | "category"
    | "description"
    | "applyUrl"
    | "postedAt"
    | "sourceUrl"
    | "slug",
    string
  >
>;

export type MappedJob = {
  title: string;
  company?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  applyUrl?: string | null;
  postedAt: Date | null;
  sourceUrl: string;
};

function parsePostedAt(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function pickString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/**
 * Fetch a jobs listing JSON API and map entries using `fieldMap`.
 * `listPath`: dot path to the array (omit to auto-detect common wrapper keys).
 * `detailUrlTemplate`: e.g. `https://example.com/jobs/{{id}}` when `sourceUrl` is not a direct field.
 * `idPath`: dot path to stable id for template (default `id`).
 */
export async function fetchJobsFromApi(options: {
  apiUrl: string;
  listPath?: string;
  fieldMap: FieldMap;
  headers?: Record<string, string>;
  detailUrlTemplate?: string;
  idPath?: string;
}): Promise<MappedJob[]> {
  const { apiUrl, listPath, fieldMap, headers, detailUrlTemplate, idPath = "id" } = options;

  if (!fieldMap.title) {
    throw new Error("WEBSITE_JOBS_FIELD_MAP must include a JSON key \"title\" mapping to an API field path.");
  }

  const res = await fetch(apiUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Jobs API HTTP ${res.status}: ${await res.text().then((t) => t.slice(0, 500))}`);
  }

  const body: unknown = await res.json();
  const rows = detectJobsArray(body, listPath);
  const out: MappedJob[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;

    const mapOne = (key: keyof FieldMap) => {
      const path = fieldMap[key];
      return path ? getByPath(entry, path) : undefined;
    };

    const title = pickString(mapOne("title"));
    if (!title) continue;

    let sourceUrl = pickString(mapOne("sourceUrl"));
    if (!sourceUrl && detailUrlTemplate) {
      const idVal = getByPath(entry, idPath);
      const idStr = idVal != null ? String(idVal) : "";
      if (idStr) {
        sourceUrl = detailUrlTemplate
          .replace(/\{\{id\}\}/g, encodeURIComponent(idStr))
          .replace(/\{\{slug\}\}/g, encodeURIComponent(idStr));
      }
    }
    if (!sourceUrl) {
      const slug = pickString(mapOne("slug"));
      if (slug && detailUrlTemplate) {
        sourceUrl = detailUrlTemplate.replace(/\{\{slug\}\}/g, encodeURIComponent(slug));
      }
    }
    if (!sourceUrl) {
      console.warn("[website] skip row (no sourceUrl / id for template):", title.slice(0, 60));
      continue;
    }

    out.push({
      title,
      company: pickString(mapOne("company")),
      location: pickString(mapOne("location")),
      category: pickString(mapOne("category")),
      description: pickString(mapOne("description")),
      applyUrl: pickString(mapOne("applyUrl")) ?? sourceUrl,
      postedAt: parsePostedAt(mapOne("postedAt")),
      sourceUrl,
    });
  }

  return out;
}
