import { Delete } from "@fartlabs/rtx";
import { Get, Post, Router } from "@fartlabs/rtx";
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
  const auth = headers.get("Authorization");
  return auth === `Token ${Deno.env.get("GO_TOKEN")}`;
}

if (import.meta.main) {
  const kv = await Deno.openKv();
  const goService = new GoService(kv);
  const router = (
    <Router>
      <Post
        pattern="/api"
        handle={async (ctx) => {
          if (!isAuthorized(ctx.request.headers)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const body = await ctx.request.json();
          await goService.add(body.alias, body.destination, body.force);
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
          await goService.delete(body.alias);
          return Response.json({ message: "Shortlink deleted." });
        }}
      />
      <Get
        pattern="/:path*"
        handle={async (ctx) => {
          const shortlinks = await goService.shortlinks();
          const destination = go(ctx.url, shortlinks);
          return new Response(
            `Going to ${destination.href}...`,
            {
              status: 302,
              headers: { "Location": destination.href },
            },
          );
        }}
      />
    </Router>
  );

  Deno.serve((request) => router.fetch(request));
}
