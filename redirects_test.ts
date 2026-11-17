import { assertEquals, assertThrows } from "@std/assert";
import { readLinks } from "./build.ts";
import {
  formatRedirects,
  generateRedirects,
  MAX_DYNAMIC_REDIRECTS,
  MAX_RULE_LENGTH,
  MAX_STATIC_REDIRECTS,
} from "./redirects.ts";

Deno.test("an absolute destination gets an exact rule and a splat rule", () => {
  const { rules, skipped } = generateRedirects({ gh: "https://github.com/FartLabs" });
  assertEquals(rules, [
    { source: "/gh", destination: "https://github.com/FartLabs", status: 302 },
    { source: "/gh/*", destination: "https://github.com/FartLabs/:splat", status: 302 },
  ]);
  assertEquals(skipped, []);
});

Deno.test("a bare-origin destination does not produce a double slash in the splat", () => {
  const { rules } = generateRedirects({ yt: "https://youtube.com" });
  assertEquals(rules[0], { source: "/yt", destination: "https://youtube.com/", status: 302 });
  assertEquals(rules[1], { source: "/yt/*", destination: "https://youtube.com/:splat", status: 302 });
});

Deno.test("a destination with a trailing slash does not produce a double slash", () => {
  const { rules } = generateRedirects({ docs: "https://example.com/docs/" });
  assertEquals(rules[1].destination, "https://example.com/docs/:splat");
});

Deno.test("chained aliases collapse to the final destination", () => {
  const { rules } = generateRedirects({
    gh: "/github",
    github: "https://github.com/FartLabs",
    x: "/gh",
  });
  const byAlias = Object.fromEntries(
    rules.filter((r) => !r.source.endsWith("/*")).map((r) => [r.source, r.destination]),
  );
  assertEquals(byAlias["/gh"], "https://github.com/FartLabs");
  assertEquals(byAlias["/x"], "https://github.com/FartLabs");
  assertEquals(byAlias["/github"], "https://github.com/FartLabs");
});

Deno.test("a chained alias gets a splat to the final destination", () => {
  const { rules } = generateRedirects({ gh: "/github", github: "https://github.com/FartLabs" });
  assertEquals(rules.find((r) => r.source === "/gh/*")?.destination, "https://github.com/FartLabs/:splat");
});

Deno.test("aliases that resolve back to this site are skipped, not emitted", () => {
  const { rules, skipped } = generateRedirects({
    docs: "/documentation",
    brand: "/brand",
    ok: "https://example.com",
  });
  assertEquals(rules.map((r) => r.source), ["/ok", "/ok/*"]);
  assertEquals(skipped.map((s) => [s.alias, s.kind]), [["docs", "alias"], ["brand", "alias"]]);
});

Deno.test("a destination with a query or fragment gets no splat rule", () => {
  const { rules, skipped } = generateRedirects({
    dm: "https://x.com/messages/compose?recipient_id=1",
    top: "https://example.com/page#top",
  });
  assertEquals(rules.map((r) => r.source), ["/dm", "/top"]);
  assertEquals(skipped.map((s) => [s.alias, s.kind]), [["dm", "splat"], ["top", "splat"]]);
});

Deno.test("static rules come before splat rules, and longer splats come first", () => {
  const { rules } = generateRedirects({
    and: "https://and.example.com",
    "and/dad": "https://and.example.com/dad",
    zed: "https://zed.example.com",
  });
  assertEquals(rules.map((r) => r.source), ["/and", "/and/dad", "/zed", "/and/dad/*", "/and/*", "/zed/*"]);
});

Deno.test("a nested alias is not shadowed by its parent's splat", () => {
  const { rules } = generateRedirects({
    and: "https://and.example.com",
    "and/dad": "https://dad.example.com",
  });
  // /and/dad (static) is earlier than /and/* (dynamic), so it wins.
  assertEquals(rules.findIndex((r) => r.source === "/and/dad") < rules.findIndex((r) => r.source === "/and/*"), true);
});

Deno.test("the status code is configurable", () => {
  const { rules } = generateRedirects({ a: "https://example.com" }, 301);
  assertEquals(rules.every((r) => r.status === 301), true);
});

Deno.test("aliases with characters Cloudflare treats as syntax are rejected", () => {
  for (const alias of ["", "a b", "a*", ":splat", "a:b", "/leading", "trailing/", "a//b", "a?b", "a#b", "ünï"]) {
    assertThrows(
      () => generateRedirects({ [alias]: "https://example.com" }),
      Error,
      "invalid alias",
      JSON.stringify(alias),
    );
  }
});

Deno.test("aliases with dots, dashes, underscores and tildes are accepted", () => {
  const { rules } = generateRedirects({ "resume.pdf": "https://example.com/r.pdf", "a_b-c~d": "https://example.com" });
  assertEquals(rules.map((r) => r.source).includes("/resume.pdf"), true);
  assertEquals(rules.map((r) => r.source).includes("/a_b-c~d"), true);
});

Deno.test("an unresolvable cycle fails the build and names the alias", () => {
  assertThrows(
    () => generateRedirects({ a: "/b", b: "/a" }),
    Error,
    'cannot resolve alias "a"',
  );
});

Deno.test("exceeding the dynamic redirect limit fails the build", () => {
  const links: Record<string, string> = {};
  for (let i = 0; i <= MAX_DYNAMIC_REDIRECTS; i++) links[`l${i}`] = `https://example.com/${i}`;
  assertThrows(() => generateRedirects(links), Error, "dynamic redirects exceeds");
});

Deno.test("exactly the dynamic redirect limit is allowed", () => {
  const links: Record<string, string> = {};
  for (let i = 0; i < MAX_DYNAMIC_REDIRECTS; i++) links[`l${i}`] = `https://example.com/${i}`;
  assertEquals(generateRedirects(links).rules.length, MAX_DYNAMIC_REDIRECTS * 2);
});

Deno.test("limits match Cloudflare's documented values", () => {
  assertEquals([MAX_STATIC_REDIRECTS, MAX_DYNAMIC_REDIRECTS, MAX_RULE_LENGTH], [2000, 100, 1000]);
});

Deno.test("a rule longer than the declaration limit fails the build", () => {
  assertThrows(
    () => generateRedirects({ long: `https://example.com/${"a".repeat(MAX_RULE_LENGTH)}` }),
    Error,
    "exceeds 1000 characters",
  );
});

Deno.test("output is deterministic for the same input", () => {
  const links = { b: "https://b.example.com", a: "https://a.example.com", "a/x": "https://x.example.com" };
  assertEquals(generateRedirects(links), generateRedirects({ ...links }));
});

Deno.test("an empty link set produces no rules", () => {
  assertEquals(generateRedirects({}), { rules: [], skipped: [] });
});

Deno.test("formatRedirects renders a header, one line per rule, and a trailing newline", () => {
  const text = formatRedirects([
    { source: "/gh", destination: "https://github.com", status: 302 },
    { source: "/gh/*", destination: "https://github.com/:splat", status: 302 },
  ]);
  assertEquals(
    text,
    "# Generated by build.ts from links.json. Do not edit.\n/gh https://github.com 302\n/gh/* https://github.com/:splat 302\n",
  );
});

Deno.test("formatRedirects with no rules is just the header", () => {
  assertEquals(formatRedirects([]), "# Generated by build.ts from links.json. Do not edit.\n");
});

Deno.test("the real links.json builds without errors", async () => {
  const links = await readLinks();
  const { rules } = generateRedirects(links);
  assertEquals(rules.length > 0, true);
});
