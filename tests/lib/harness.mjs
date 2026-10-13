// Shared test harness: finds Playwright, serves the app folder over HTTP, and fulfils requests for
// the Leaflet CDN from the bundled copy so tests never depend on the internet.
import { createRequire } from "node:module";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";

/** The app folder: the parent of tests/. */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
  ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8"
};

export const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "*" };

/** Case names given on the command line (empty: run all cases). */
export const ONLY = process.argv.slice(2);
export const wanted = (name) => ONLY.length === 0 || ONLY.includes(name);

/** Where screenshots, downloads and result files go (outside the app folder by default). */
export async function outDir(suite) {
  const dir = path.join(process.env.NAV_TEST_OUT || path.join(os.tmpdir(), "navigator-tests"), suite);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Playwright is not part of the app. Install it once, globally or in any folder:
 *   npm install -g playwright && npx playwright install chromium
 * and run with NODE_PATH="$(npm root -g)", or point PLAYWRIGHT_MODULE at its folder.
 */
export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "playwright-core"].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try the next one */ }
  }
  console.error("Playwright was not found. Install it with `npm install -g playwright` and `npx playwright install chromium`,\nthen run the tests with NODE_PATH=\"$(npm root -g)\" (or set PLAYWRIGHT_MODULE to the playwright folder).");
  process.exit(2);
}

/** Chromium from Playwright, or the browser at CHROME_PATH. */
export async function launchBrowser() {
  const { chromium } = loadPlaywright();
  return chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
}

/**
 * Serves `root` on 127.0.0.1:`port`. Paths in `blockLocal` (prefixes) answer 404, to simulate a
 * missing file. Returns { base, blockLocal, close }.
 */
export async function serveStatic(root, port) {
  const blockLocal = new Set();
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(root, path.normalize(p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if ([...blockLocal].some((b) => p.startsWith(b))) { res.writeHead(404); res.end("blocked by test"); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { base: `http://127.0.0.1:${port}/`, blockLocal, close: () => new Promise((r) => server.close(r)) };
}

/** Fulfils a unpkg.com Leaflet request from vendor/; returns false if the URL is not Leaflet. */
export async function fulfilLeaflet(route, root = APP_ROOT) {
  const u = new URL(route.request().url());
  if (u.host !== "unpkg.com") return false;
  const m = u.pathname.match(/^\/leaflet@1\.9\.4\/dist\/(.+)$/);
  if (!m) return false;
  const body = await readFile(path.join(root, "vendor/leaflet-1.9.4", m[1]));
  await route.fulfill({ status: 200, body, headers: { "content-type": MIME[path.extname(m[1])] || "application/octet-stream", ...CORS } });
  return true;
}

/** Console noise that blocked external requests cause in every test. */
export const NETWORK_NOISE = /Failed to load resource|net::ERR_|ERR_BLOCKED_BY_CLIENT|ERR_FAILED/;

/** A key-shaped string that is obviously not a real key. */
export const MOCK_KEY = "sk-ant-test-MOCKKEY-0123456789abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Init script for browser contexts: marks the intro window as seen, so it does not open by itself
 * and cover the controls. The smoke suite's "intro" case runs without it.
 */
export const SKIP_INTRO = () => { try { localStorage.setItem("nav.introSeen", "1"); } catch { /* file:// or blocked storage */ } };
