// Shared test harness: finds Playwright and ViciDesign, serves the app folder over HTTP, and loads
// the app's data and modules into Node as the page loads them. The app needs no CDN and no tiles, so
// every external request in a browser test is answered by a fixture or blocked.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The app folder: the parent of tests/. */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ARGS = process.argv.slice(2);
/** Case names given on the command line (empty: run all cases); options start with "--". */
export const ONLY = ARGS.filter((a) => !a.startsWith("--"));
export const wanted = (name) => ONLY.length === 0 || ONLY.includes(name);
export const REQUIRE_VICI = ARGS.includes("--require-vici");

export const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2",
  ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8"
};
export const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "*" };

/** The windows the layout is tested in: a 1080p projector, a 1366 laptop, a 1280 × 720 share. */
export const VIEWPORTS = [[1920, 1080], [1366, 768], [1280, 720]];
export const STEP_IDS = ["spot", "check", "calculate", "propose", "prepare"];
export const KPI_NAMES = ["Value at risk", "First line stop in", "Detection → decision", "Session cost"];

/** Collects PASS and FAIL lines; end() prints them, then the token when every check passed. */
export function checks() {
  const results = [];
  return {
    check: (ok, what) => { results.push([!!ok, what]); return !!ok; },
    failed: () => results.filter(([ok]) => !ok).length,
    end(token) {
      let failed = 0;
      for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
      if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
      console.log(`\nAll ${results.length} checks passed.\n${token}`);
    }
  };
}

/** Where screenshots go (outside the app folder by default). */
export async function outDir(suite) {
  const dir = path.join(process.env.NAV_TEST_OUT || path.join(os.tmpdir(), "navigator-tests"), suite);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Playwright is not part of the app. Install it once, globally or in any folder:
 *   npm install -g playwright@1.56.0 && npx playwright install chromium
 * and run with NODE_PATH="$(npm root -g)", or point PLAYWRIGHT_MODULE at its folder.
 */
export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright"].filter(Boolean);
  try { candidates.push(path.join(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "playwright")); } catch { /* no npm */ }
  for (const c of candidates) {
    try { return require(c); } catch { /* try the next one */ }
  }
  console.error("Playwright was not found. Install it with `npm install -g playwright@1.56.0` and `npx playwright install chromium`,\nthen run the tests with NODE_PATH=\"$(npm root -g)\" (or set PLAYWRIGHT_MODULE to the playwright folder).");
  process.exit(2);
}

/** Chromium from Playwright, or the browser at CHROME_PATH. */
export async function launchBrowser() {
  const { chromium } = loadPlaywright();
  return chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
}

/** Serves `root` on a free port of 127.0.0.1. Returns { base, close }. */
export async function serveStatic(root = APP_ROOT) {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(root, path.normalize(p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

/** A context that answers nothing outside 127.0.0.1, so a test sees every request the page makes. */
export async function offlineContext(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ...options });
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); return route.abort("blockedbyclient"); });
  return { context, external };
}

/** Console noise that blocked external requests cause in every test. */
export const NETWORK_NOISE = /Failed to load resource|net::ERR_|ERR_BLOCKED_BY_CLIENT|ERR_FAILED/;

/** A key-shaped string that is obviously not a real key. */
export const MOCK_KEY = "sk-ant-test-MOCKKEY-0123456789abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * The ViciDesign checkout whose checks and files the suites use: VICI_DIR, or ../ViciDesign next to
 * this repository. Without one a suite says so and passes, unless --require-vici is given, as on
 * GitHub Actions, which checks ViciDesign out at the commit vici/ was copied from.
 */
export function viciDir() {
  return [process.env.VICI_DIR, path.resolve(APP_ROOT, "..", "ViciDesign"), path.resolve(APP_ROOT, "..", "vicidesign")]
    .filter(Boolean).find((d) => existsSync(path.join(d, "scripts", "lib", "guide.mjs"))) || null;
}

let app = null;
/**
 * The app's data and modules in Node, as the page loads them: data/*.js become globals, and the
 * modules that need no page (story, view's pure helpers, format, cost, tools, world) are imported.
 */
export async function loadApp() {
  if (app) return app;
  globalThis.window = globalThis;
  const require = createRequire(import.meta.url);
  for (const f of ["world", "scenarios", "reference_cases", "sim_runs", "basemap_offline"]) require(path.join(APP_ROOT, "data", `${f}.js`));
  const mod = (name) => import(pathToFileURL(path.join(APP_ROOT, "js", `${name}.js`)).href);
  app = { story: await mod("story"), view: await mod("view"), format: await mod("format"), cost: await mod("cost"), tools: await mod("tools") };
  return app;
}
