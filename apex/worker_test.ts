import { assertEquals } from "@std/assert";
import { redirectApex } from "./worker.ts";

Deno.test("redirectApex sends the root to fartlabs.org", () => {
  const response = redirectApex(new Request("https://fart.tools/"));
  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), "https://fartlabs.org/");
});

Deno.test("redirectApex keeps the path and query string", () => {
  const response = redirectApex(new Request("https://fart.tools/blog/post?ref=x"));
  assertEquals(response.headers.get("location"), "https://fartlabs.org/blog/post?ref=x");
});
