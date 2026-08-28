import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("every shared show module imported by a browser entry has a server route", async () => {
  const [server, ...browserEntries] = await Promise.all([
    readFile(new URL("../server.js",import.meta.url),"utf8"),
    readFile(new URL("../public/operator/operator.js",import.meta.url),"utf8"),
    readFile(new URL("../public/projector/projector.js",import.meta.url),"utf8"),
    readFile(new URL("../public/ipad/ipad.js",import.meta.url),"utf8"),
    readFile(new URL("../public/nugget/nugget.js",import.meta.url),"utf8"),
    readFile(new URL("../public/lighting/lighting.js",import.meta.url),"utf8")
  ]);
  const imports = new Set(browserEntries.flatMap((source) =>
    [...source.matchAll(/from\s+["'](\/show\/[^"']+)["']/g)].map((match) => match[1])
  ));
  for (const importedPath of imports) {
    assert.match(server,new RegExp(`url\\.pathname === ["']${importedPath.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}["']`),`${importedPath} must be served`);
  }
});
