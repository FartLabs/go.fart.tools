import { Delete, Get, Post, Router } from "@fartlabs/rtx";
import {
  A,
  BODY,
  BR,
  BUTTON,
  FORM,
  H1,
  HEAD,
  HTML,
  INPUT,
  LABEL,
  LINK,
  SCRIPT,
  TITLE,
} from "@fartlabs/htx";
import { go } from "go/go.ts";

type Shortlinks = Record<string, string>;

class GoService {
  public constructor(
    private readonly kv: Deno.Kv,
    private readonly kvNamespace: Deno.KvKey = ["go"],
  ) {}

  public async add(
    alias: string,
    destination: string,
    force = false,
  ): Promise<void> {
    const shortlinksResult = await this.kv.get<Shortlinks>(this.kvNamespace);
    const shortlinks = shortlinksResult.value ?? {};
    if (!force && shortlinks[alias]) {
      throw new Error("Shortlink already exists.");
    }

    shortlinks[alias] = destination;
    const result = await this.kv.atomic()
      .check(shortlinksResult)
      .set(this.kvNamespace, shortlinks)
      .commit();
    if (!result.ok) {
      throw new Error("Failed to add shortlink.");
    }
  }

  public async delete(alias: string): Promise<void> {
    const shortlinksResult = await this.kv.get<Shortlinks>(this.kvNamespace);
    const shortlinks = shortlinksResult.value ?? {};
    if (!shortlinks[alias]) {
      throw new Error("Shortlink does not exist.");
    }

    delete shortlinks[alias];
    const result = await this.kv.atomic()
      .check(shortlinksResult)
      .set(this.kvNamespace, shortlinks)
      .commit();
    if (!result.ok) {
      throw new Error("Failed to delete shortlink.");
    }
  }

  public async shortlinks(): Promise<Shortlinks> {
    const shortlinksResult = await this.kv.get<Shortlinks>(this.kvNamespace);
    return shortlinksResult.value ?? {};
  }
}

function isAuthorized(headers: Headers): boolean {
  return headers.get("Authorization") === `Token ${Deno.env.get("GO_TOKEN")}`;
}

function GoRouter(props: { service: GoService }) {
  return (
    <Router error={(error) => Response.json({ error: error.message })}>
      <Post
        pattern="/api"
        handle={async (ctx) => {
          if (!isAuthorized(ctx.request.headers)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const body = await ctx.request.json();
          await props.service.add(body.alias, body.destination, body.force);
          return Response.json(
            { message: "Shortlink created." },
            { status: 201 },
          );
        }}
      />
      <Delete
        pattern="/api"
        handle={async (ctx) => {
          if (!isAuthorized(ctx.request.headers)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const body = await ctx.request.json();
          await props.service.delete(body.alias);
          return Response.json({ message: "Shortlink deleted." });
        }}
      />
      <Get
        pattern="/favicon.ico"
        handle={() =>
          new Response(
            null,
            {
              status: 302,
              headers: { "Location": "https://deno.land/favicon.ico" },
            },
          )}
      />
      <Get
        pattern="/"
        handle={() =>
          new Response(
            <HTML>
              <HEAD>
                <TITLE>go.fart.tools</TITLE>
                <LINK
                  rel="stylesheet"
                  href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css"
                />
              </HEAD>
              <BODY>
                <H1>
                  <A href="/">go.fart.tools</A>
                </H1>
                <FORM>
                  <LABEL for="alias">
                    Alias:
                    <INPUT
                      name="alias"
                      placeholder="example"
                      autofocus="true"
                    />
                  </LABEL>
                  <BR />
                  <LABEL for="destination">
                    Destination:
                    <INPUT
                      name="destination"
                      placeholder="https://example.com"
                    />
                  </LABEL>
                  <BR />
                  <LABEL for="token">
                    Token:
                    <INPUT type="password" name="token" />
                  </LABEL>
                  <BR />
                  <BUTTON type="submit">Submit</BUTTON>
                </FORM>

                <SCRIPT>
                  {Deno.readTextFileSync(
                    new URL(import.meta.resolve("./static/ui.js")),
                  )}
                </SCRIPT>
              </BODY>
            </HTML>,
            { headers: { "Content-Type": "text/html" } },
          )}
      />
      <Get
        pattern="/:path*"
        handle={async (ctx) => {
          const shortlinks = await props.service.shortlinks();
          const destination = go(ctx.url, shortlinks);
          return new Response(
            null,
            {
              status: 302,
              headers: { "Location": destination.href },
            },
          );
        }}
      />
    </Router>
  );
}

if (import.meta.main) {
  const kv = await Deno.openKv();
  const goService = new GoService(kv);
  const router = <GoRouter service={goService} />;
  Deno.serve((request) => router.fetch(request));
}
