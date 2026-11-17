/** Where the apex domain sends visitors. */
export const APEX_TARGET = "https://fartlabs.org";

/**
 * Redirects every request to `fartlabs.org`, keeping the path and query string.
 *
 * The apex is a temporary `302` so it can be pointed elsewhere without browsers caching the move.
 */
export function redirectApex(request: Request): Response {
  const url = new URL(request.url);
  return Response.redirect(new URL(url.pathname + url.search, APEX_TARGET), 302);
}

export default {
  fetch: redirectApex,
};
