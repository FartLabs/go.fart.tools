import { createRouter } from "@fartlabs/rt";
import { go } from "go/go.ts";

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
    const collectionResult = await this.kv.get<string>(this.kvNamespace);
    const collection = collectionResult.value
      ? JSON.parse(collectionResult.value)
      : {};
    if (!force && collection[alias]) {
      throw new Error("Shortlink already exists.");
    }

    collection[alias] = destination;
    const result = await this.kv.atomic()
      .check(collectionResult)
      .set(this.kvNamespace, JSON.stringify(collection))
      .commit();
    if (!result.ok) {
      throw new Error("Failed to add shortlink.");
    }
  }

  public async delete(alias: string): Promise<void> {
    const collectionResult = await this.kv.get<string>(this.kvNamespace);
    const collection = collectionResult.value
      ? JSON.parse(collectionResult.value)
      : {};
    delete collection[alias];
    const result = await this.kv.atomic()
      .check(collectionResult)
      .set(this.kvNamespace, JSON.stringify(collection))
      .commit();
    if (!result.ok) {
      throw new Error("Failed to delete shortlink.");
    }
  }

  public async collection(): Promise<Record<string, string>> {
    const collectionResult = await this.kv.get<string>(this.kvNamespace);
    return collectionResult.value ? JSON.parse(collectionResult.value) : {};
  }
}

function isAuthorized(headers: Headers): boolean {
  const auth = headers.get("Authorization");
  return auth === `Token ${Deno.env.get("GO_TOKEN")}`;
}

if (import.meta.main) {
  const kv = await Deno.openKv();
  const goService = new GoService(kv);
  const router = createRouter()
    // TODO: Use rtx to define the routes. Use htx to define the HTML index page.
    .post("/api", async (ctx) => {
      if (!isAuthorized(ctx.request.headers)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body = await ctx.request.json();
      await goService.add(body.alias, body.destination, body.force);
      return Response.json({ message: "Shortlink created." }, { status: 201 });
    })
    .delete("/api", async (ctx) => {
      if (!isAuthorized(ctx.request.headers)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body = await ctx.request.json();
      await goService.delete(body.alias);
      return Response.json({ message: "Shortlink deleted." });
    })
    .get("/:path*", async (ctx) => {
      const collection = await goService.collection();
      const destination = go(ctx.url, collection);
      return new Response(
        `Going to ${destination.href}...`,
        {
          status: 302,
          headers: { "Location": destination.href },
        },
      );
    });

  Deno.serve((request) => router.fetch(request));
}
