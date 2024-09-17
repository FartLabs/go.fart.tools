import { assertEquals } from "@std/assert";
import { go } from "./go.ts";

Deno.test("go resolves shortlinks", () => {
  const actual = go(new URL("https://example.com/github"), {
    github: "https://github.com/FartLabs/go.fart.tools",
  });
  const expected = new URL("https://github.com/FartLabs/go.fart.tools");
  assertEquals(actual.href, expected.href);
});

Deno.test("go throws for circularly recursive shortlinks", () => {
  function testCircularShortlinks() {
    return go(new URL("https://example.com/zig"), {
      zig: "/zag",
      zag: "/zig",
    });
  }

  let error;
  try {
    testCircularShortlinks();
  } catch (e) {
    error = e;
  } finally {
    assertEquals(error.message, "too many internal redirects");
  }
});

Deno.test("go properly combines queries", () => {
  const actual = go(new URL("https://example.com/example?foo=bar"), {
    example: "https://example.com?baz=qux",
  });
  const expected = new URL("https://example.com/?baz=qux&foo=bar");
  assertEquals(actual.href, expected.href);
});

Deno.test("go properly overwrites hash", () => {
  const actual = go(new URL("https://example.com/example#yang"), {
    example: "https://example.com#yin",
  });
  assertEquals(actual, new URL("https://example.com/#yang"));
});

Deno.test("go overwrites hash (2)", () => {
  const actual = go(new URL("https://example.com/one#uno"), {
    one: "/two",
    two: "/three#dos",
    three: "/example#tres",
    example: "https://example.com",
  });
  const expected = new URL("https://example.com/#uno");
  assertEquals(actual.href, expected.href);
});

Deno.test("go appends pathnames", () => {
  const actual = go(new URL("https://example.com/example/baz/qux"), {
    example: "https://example.com/foo/bar",
  });
  const expected = new URL("https://example.com/foo/bar/baz/qux");
  assertEquals(actual.href, expected.href);
});

Deno.test("go appends pathnames only if separated by / or end of string", () => {
  const shortlinks = { c: "https://example.com/calendar" };
  const actual1 = go(new URL("https://example.com/colors"), shortlinks);
  const expected1 = new URL("https://example.com/colors");
  assertEquals(actual1.href, expected1.href);

  const actual2 = go(new URL("https://example.com/c"), shortlinks);
  const expected2 = new URL("https://example.com/calendar");
  assertEquals(actual2.href, expected2.href);
});

Deno.test("go resolves relative paths", () => {
  const actual = go(new URL("https://example.com/student-pack"), {
    "student-pack": "/blog/806",
  });
  const expected = new URL("https://example.com/blog/806");
  assertEquals(actual.href, expected.href);
});

Deno.test("go resolves alias shortlink", () => {
  const expected = new URL("https://example.com/blog/806");
  const input = new URL("https://example.com/student-pack");
  const actual = go(input, { "student-pack": "/blog/806" });
  assertEquals(actual.href, expected.href);
});

Deno.test("go returns passed URL if invalid or not found", () => {
  [
    new URL("https://example.com/doesnotexist"),
    new URL("https://example.com/does/not/exist"),
    new URL("https://example.com/<invalid>"),
  ].forEach((input) => {
    assertEquals(go(input, {}), input, `failed on ${input}`);
  });
});

Deno.test("go resolves subdomain destination", () => {
  const expected = new URL("https://foobar.example.com/example");
  const input = new URL("https://example.com/foo/bar");
  const actual = go(input, { "foo/bar": "https://foobar.example.com/example" });
  assertEquals(actual.href, expected.href);
});
