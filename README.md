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

## Deploying

`go.fart.tools` is served by the `go-fart-tools` Cloudflare Worker (static assets) through the custom-domain route in
`wrangler.jsonc`. It moved here from Deno Deploy on 2026-11-17, ahead of Deno Deploy's shutdown in April 2027.

Deploys are manual and nothing deploys on merge:

```sh
deno task build
npx wrangler deploy
```

The Cloudflare account is the one that owns the `fart.tools` zone. After deploying, check `/code` (a `302` to
`https://github.com/FartLabs/`), `/code/go` (a `302` to `https://github.com/FartLabs/go`), and an unknown path (`404`).
Request query strings are carried through redirects, for example `/twitter?ref=foo`.

Deploying on merge needs a Cloudflare API token stored as a repository secret, which has not been set up.

### Cutover record

The domain was attached in the Cloudflare dashboard after deleting two records that conflicted with it, which Cloudflare
requires. Rollback to Deno Deploy means re-adding both, though Deno Deploy itself shuts down in April 2027:

- `go.fart.tools` CNAME `alias.deno.net`, DNS only
- `_acme-challenge.go.fart.tools` CNAME `28f0b1aa046b4ecd90e07e91538f9dcb._acme.deno.net`, DNS only

Other `fart.tools` subdomains (`css`, `jsonx`, `silly`, and the apex) still point at `alias.deno.net` and need the same
move before April 2027.

## Dependency note

`deno.json` imports `@fartlabs/go` from a pinned commit instead of JSR. The released `0.0.3` predates the cycle and
self-reference fixes, and this repo's tests rely on them. Once a newer version is published to JSR, switch the import to
`jsr:@fartlabs/go@^<version>`.

## Differences from the old service

- `POST` and `DELETE /api`, and `GET /api`, are gone. The list is at `/links.json` and changes go through pull requests.
- Matching is case-sensitive, as before.
