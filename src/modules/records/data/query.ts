export const LIST_LIMIT = 200;

// PostgREST's or() filter is a comma-separated string, so a search term must not be able
// to add conditions of its own. LIKE wildcards are neutralised for the same reason.
export function escapeForSearch(term: string): string {
  return term.replace(/[,()"\\%_]/g, ' ').trim();
}
