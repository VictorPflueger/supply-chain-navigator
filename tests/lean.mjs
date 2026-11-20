// How lean the showcase stays: limits a change has to argue with. Node.js only.
//   app      at most 16 JavaScript modules and 4,500 lines of app JavaScript, at most 900 lines of app
//            CSS (vici/ is Vici's, tests/ aren't the app)
//   network  one module talks to the network (js/claude.js, the live run's client), and the only
//            host any module names is api.anthropic.com
//   policy   the page's content security policy connects to api.anthropic.com and nothing else, and
//            loads everything else from the site itself
//   docs     README.md at most 900 words, DEMO_SCRIPT.md at most 700
// Each rule is first tried on a planted example that must break it.
// Usage: node tests/lean.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { APP_ROOT, checks } from "./lib/harness.mjs";

const LIMITS = { modules: 16, jsLines: 4500, cssLines: 900, readmeWords: 900, scriptWords: 700 };
const NET = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/;
const HOSTS = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
const ALLOWED_HOSTS = new Set(["api.anthropic.com", "www.w3.org"]);

const { check, end } = checks();
const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const lines = (text) => text.split("\n").length;
const words = (text) => text.replace(/```[\s\S]*?```/g, " ").replace(/[|#*`>-]/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length;
/** The page's policy, as directive → sources. */
const policy = (html) => Object.fromEntries(((html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || "")
  .split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
/** Problems with a policy: anything but api.anthropic.com to connect to, or anything loaded from elsewhere. */
const policyProblems = (html) => {
  const p = policy(html);
  const out = [];
  if ((p["connect-src"] || []).join(" ") !== "https://api.anthropic.com") out.push(`connect-src is "${(p["connect-src"] || []).join(" ")}"`);
  for (const [k, v] of Object.entries(p)) if (k !== "connect-src" && v.some((s) => /^https?:|^\*$|^wss?:/.test(s))) out.push(`${k} loads from ${v.join(" ")}`);
  if (!p["default-src"]?.includes("'self'")) out.push("no default-src 'self'");
  return out;
};
const hostsIn = (text) => [...text.matchAll(HOSTS)].map((m) => m[1].toLowerCase()).filter((h) => !ALLOWED_HOSTS.has(h));

// The rules catch what they are for.
check(NET.test('const r = await fetch("https://api.open-meteo.com/v1/forecast");') && !NET.test("const fetched = items.filter(Boolean);"), "control: the network pattern catches a request and passes ordinary code");
check(hostsIn('const URL = "https://api.open-meteo.com/v1/forecast";').length === 1 && !hostsIn('fetch("https://api.anthropic.com/v1/messages")').length, "control: a host other than api.anthropic.com is caught");
check(policyProblems(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src https://api.anthropic.com https://unpkg.com">`).length > 0 && policyProblems(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://unpkg.com; connect-src https://api.anthropic.com">`).length > 0, "control: a policy that connects or loads elsewhere is caught");

const js = readdirSync(path.join(APP_ROOT, "js")).filter((f) => f.endsWith(".js"));
const jsLines = js.reduce((n, f) => n + lines(read(`js/${f}`)), 0);
const css = readdirSync(path.join(APP_ROOT, "css")).filter((f) => f.endsWith(".css"));
const cssLines = css.reduce((n, f) => n + lines(read(`css/${f}`)), 0);
check(js.length <= LIMITS.modules, `app: ${js.length} JavaScript modules, at most ${LIMITS.modules}`);
check(jsLines <= LIMITS.jsLines, `app: ${jsLines} lines of JavaScript, at most ${LIMITS.jsLines}`);
check(cssLines <= LIMITS.cssLines, `app: ${cssLines} lines of CSS in ${css.length} file(s), at most ${LIMITS.cssLines}`);

const net = js.filter((f) => NET.test(read(`js/${f}`)));
check(net.join() === "claude.js", `network: only js/claude.js makes requests${net.length ? ` (found in ${net.join(", ")})` : ""}`);
const hosts = [...js.map((f) => `js/${f}`), "index.html", ...readdirSync(path.join(APP_ROOT, "data")).map((f) => `data/${f}`)]
  .flatMap((f) => hostsIn(read(f)).map((h) => `${f}: ${h}`));
const outsideLinks = hosts.filter((h) => !/^index\.html: (www\.linkedin\.com|victorpflueger\.github\.io)$/.test(h));
check(!outsideLinks.length, `network: no module or page names a host to call but api.anthropic.com${outsideLinks.length ? `; found ${[...new Set(outsideLinks)].slice(0, 6).join(", ")}` : " (the byline's links aside)"}`);
const p = policyProblems(read("index.html"));
check(!p.length, `policy: the page connects to api.anthropic.com only and loads everything from itself${p.length ? `; ${p.join("; ")}` : ""}`);

const readme = words(read("README.md"));
const script = words(read("DEMO_SCRIPT.md"));
check(readme <= LIMITS.readmeWords, `docs: README.md has ${readme} words, at most ${LIMITS.readmeWords}`);
check(script <= LIMITS.scriptWords, `docs: DEMO_SCRIPT.md has ${script} words, at most ${LIMITS.scriptWords}`);

end("LEAN OK");
