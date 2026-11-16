import { formatRedirects, generateRedirects } from "./redirects.ts";

/** readLinks loads and validates links.json. */
export async function readLinks(path = new URL("./links.json", import.meta.url)): Promise<Record<string, string>> {
  const data: unknown = JSON.parse(await Deno.readTextFile(path));
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("links.json must be a JSON object of alias -> destination");
  }

  for (const [alias, destination] of Object.entries(data)) {
    if (typeof destination !== "string" || destination === "") {
      throw new Error(`links.json: ${JSON.stringify(alias)} must map to a non-empty string`);
    }
  }

  return data as Record<string, string>;
}

/** build writes the deployable site to dist/. */
export async function build(outDir = new URL("./dist/", import.meta.url)) {
  const links = await readLinks();
  const { rules, skipped } = generateRedirects(links);

  await Deno.remove(outDir, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(outDir, { recursive: true });

  for await (const entry of Deno.readDir(new URL("./public/", import.meta.url))) {
    if (entry.isFile) {
      await Deno.copyFile(new URL(`./public/${entry.name}`, import.meta.url), new URL(entry.name, outDir));
    }
  }

  await Deno.copyFile(new URL("./links.json", import.meta.url), new URL("links.json", outDir));
  await Deno.writeTextFile(new URL("_redirects", outDir), formatRedirects(rules));

  console.log(`Wrote ${rules.length} redirect rules for ${Object.keys(links).length} links.`);
  for (const entry of skipped) {
    console.warn(`  skipped ${entry.kind} for "${entry.alias}": ${entry.reason}`);
  }
}

if (import.meta.main) {
  await build();
}
