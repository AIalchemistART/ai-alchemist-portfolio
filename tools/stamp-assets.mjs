#!/usr/bin/env node
/**
 * Stamp CSS and JS URLs in HTML with a short content hash (?v=).
 *
 * index.html is served with must-revalidate, but /assets/*.css and
 * /assets/*.js were cached for a week. A new hash is a new URL, so
 * returning visitors pick up the file on the next page load. Netlify
 * runs this before publish; running it locally is safe and idempotent.
 *
 *   node tools/stamp-assets.mjs
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pages = [
  {
    html: "index.html",
    assets: [
      ["assets/site.css", "href"],
      ["assets/app.js", "src"],
    ],
  },
  {
    html: "listing-demo/index.html",
    assets: [
      ["demo.css", "href"],
      ["demo.js", "src"],
    ],
  },
];

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
}

let failed = false;

for (const page of pages) {
  const htmlPath = path.join(root, page.html);
  let html = readFileSync(htmlPath, "utf8");
  const dir = path.dirname(htmlPath);

  for (const [url, attr] of page.assets) {
    const hash = hashFile(path.join(dir, url));
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${attr}="${escaped})(?:\\?v=[a-f0-9]+)?(")`, "g");
    let count = 0;
    const next = html.replace(re, (_match, open, close) => {
      count += 1;
      return `${open}?v=${hash}${close}`;
    });
    if (count !== 1) {
      console.error(`Could not stamp ${attr}="${url}" in ${page.html} (${count} matches)`);
      failed = true;
      continue;
    }
    html = next;
    console.log(`${page.html}: ${url}?v=${hash}`);
  }

  writeFileSync(htmlPath, html);
}

if (failed) process.exit(1);
