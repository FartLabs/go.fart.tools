# go.fart.tools

Redirect host for [go.fart.tools](https://go.fart.tools). It serves the shortlinks in [`links.json`](./links.json) as
real HTTP redirects on Cloudflare Workers static assets. There is no server and no database.

The resolution logic lives in [`@fartlabs/go`](https://github.com/FartLabs/go), which stays scoped to that logic. This
repo only hosts it.

## How it works

`deno task build` reads `links.json`, resolves every alias with `go()` (so chained aliases such as `"gh": "/github"`
collapse to their final destination), and writes `dist/`:

- `_redirects`: one exact rule and one `/alias/*` splat rule per alias, so `/github/FartLabs` keeps its subpath.
- `links.json`: the public list, served at `/links.json`.
- `index.html` and `404.html`, copied from `public/`.

Cloudflare applies `_redirects` as real `302` responses, so `curl` and link-preview crawlers (Discord, Slack) follow the
shortlink instead of seeing a 404 page.

## Adding or changing a link

Edit `links.json` and open a pull request. Values are either an absolute URL or an internal path to another alias:

```json
{
  "github": "https://github.com/FartLabs",
  "gh": "/github"
}
```

CI runs `deno task check`, which formats, lints, tests, and builds. The build fails on:

- an alias with characters that Cloudflare would read as syntax (`*`, `:`, spaces, a leading or trailing `/`);
- a redirect cycle;
- more than 2,000 static or 100 dynamic redirects, which are Cloudflare's documented limits.

Entries that resolve back to this site, such as `"docs": "/documentation"`, have no page to land on, so the build skips
them and prints a warning.

## Commands

```sh
deno task check   # fmt --check, lint, test, build
deno task build   # write dist/
```

## Deploying and cutover

Nothing deploys automatically yet. `go.fart.tools` still points at Deno Deploy (`alias.deno.net`), which shuts down in
April 2027. Cutover is a manual sequence:

1. Run `deno task build`, then `npx wrangler deploy` and check the `workers.dev` preview URL: `/code`, `/code/go`
   (expect a redirect to `github.com/FartLabs/go`), and an unknown path (expect `404`).
2. Confirm that the request's own query string is carried through a redirect. This is not covered by the Cloudflare
   docs, and it is a difference from the old service, which merged query strings.
3. In `wrangler.jsonc`, uncomment the `go.fart.tools` custom-domain route. Remove the existing `go.fart.tools` CNAME and
   the `_acme-challenge` CNAME in Cloudflare DNS first, because a custom domain cannot replace an existing record.
4. Deploy, then verify `https://go.fart.tools/code` returns a `302` to `https://github.com/FartLabs/`.

## Dependency note

`deno.json` imports `@fartlabs/go` from a pinned commit instead of JSR. The released `0.0.3` predates the cycle and
self-reference fixes, and this repo's tests rely on them. Once a newer version is published to JSR, switch the import to
`jsr:@fartlabs/go@^<version>`.

## Differences from the old service

- `POST` and `DELETE /api`, and `GET /api`, are gone. The list is at `/links.json` and changes go through pull requests.
- Matching is case-sensitive, as before.
