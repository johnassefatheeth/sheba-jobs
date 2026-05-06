/** Dot-path getter, e.g. `data.results.0` is not supported — only simple keys: `data.results` then index in caller. */
export function getByPath(obj: unknown, path: string): unknown {
  if (path === "" || path === ".") return obj;
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function detectJobsArray(body: unknown, listPath: string | undefined): unknown[] {
  if (listPath?.trim()) {
    const v = getByPath(body, listPath.trim());
    return Array.isArray(v) ? v : [];
  }
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    for (const key of [
      "data",
      "jobs",
      "results",
      "items",
      "records",
      "positions",
      "listings",
      "vacancies",
      "opportunities",
    ]) {
      const v = (body as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}
