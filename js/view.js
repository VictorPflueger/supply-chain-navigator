// What the presenter sees for each step: the heading, the step's one thing to look at (the report,
// the sources and the alert, the impact, the options, the drafts), the agent's own words, and the
// four key figures. It reads a run record that the scripted run and a live run fill the same way.

import { STEPS } from "./story.js";
import { eurCompact, days, pct, plural, words } from "./format.js";

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : String(kid));
  return n;
};
const icon = (name) => h("span", { class: `vc-icon vc-icon--${name}`, "aria-hidden": "true" });
const all = (run, type, upTo = "prepare") => STEPS.slice(0, STEPS.findIndex((s) => s.id === upTo) + 1).flatMap((s) => run.events[s.id].filter((e) => e.type === type));
/** Words for people: Nordwerk's record ids, such as "(S-TNG-HAR)", stay in the records. */
const plain = (text) => String(text ?? "").replace(/\s\((?:S|A|N|PL|P|R|ALT)-[A-Z0-9-]+\)/g, "");
const LABEL = /^(Signal received|Hypothesis|Check|Confirmed|Not confirmed|Revised|Finding|Impact|Recommendation|First estimate|Response levers|Option [ABC] (?:approved|rejected)|Risk accepted)([:.])/;

/** The first and the latest engine figures of a run: the first estimate and the one after the check. */
export function impacts(run) {
  const k = all(run, "kpi_update").filter((e) => e.value_at_risk_eur !== undefined);
  return { first: k[0] || null, last: k[k.length - 1] || null };
}

/** The approved option's card, or null. */
export const approved = (run) => (run.decision ? run.options?.options.find((o) => o.id === run.decision.id) || null : null);

// ---- headings ---------------------------------------------------------------------------------------

export function heading(run, step) {
  const { last } = impacts(run);
  const opt = approved(run);
  const drafts = [...run.drafts.values()];
  const rec = run.options?.options.find((o) => o.recommended);
  switch (step) {
    case "spot": return run.scenario.title;
    case "check": return plain(all(run, "alert", "check")[0]?.title || all(run, "alert")[0]?.title || "Is the report true?");
    case "calculate": return last ? (last.first_stop_day === null ? `No line stop: ${eurCompact(last.value_at_risk_eur)} at risk` : `${last.first_stop_plant_name} stops on day ${last.first_stop_day}: ${eurCompact(last.value_at_risk_eur)} at risk`) : "What it would cost";
    case "propose":
      if (run.decision?.id === "baseline") return "You accepted the risk";
      if (opt) return `You approved option ${opt.letter}`;
      return rec ? `Option ${rec.letter} for ${eurCompact(rec.mitigation_cost_eur)} leaves ${eurCompact(rec.residual_var_eur)} at risk` : "Three options, and you decide";
    case "prepare": {
      if (!run.decision) return "The drafts follow your decision";
      const open = drafts.filter((d) => d.status === "pending").length;
      if (!drafts.length) return "The agent is drafting";
      return open ? `${capital(plural(drafts.length, "draft"))} wait for your approval` : `${drafts.filter((d) => d.status === "approved").length} of ${plural(drafts.length, "draft")} approved, nothing sent`;
    }
    default: return "";
  }
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- the story panel ------------------------------------------------------------------------------------

/**
 * Draws one step. handlers: { decide(optionId, decision), decideDraft(id, decision), approveAll(),
 * goto(step) }. live: { busy, step } while a live run works.
 */
export function renderStory(run, step, handlers) {
  const at = STEPS.findIndex((s) => s.id === step);
  $("story-title").textContent = heading(run, step);
  $("story-lead").textContent = STEPS[at].lead;
  $("story-card").replaceChildren(...card(run, step, handlers));
  $("agent-note").textContent = run.mode === "live" ? "Claude, live on your key. You are interacting with an AI system" : "replayed, not live";
  // A live run writes on: a reader at the foot of the story keeps seeing the newest words.
  const story = $("story");
  const follow = run.mode === "live" && story.scrollHeight - story.scrollTop - story.clientHeight < 48;
  $("agent-words").replaceChildren(...agentWords(run, step));
  if (follow) story.scrollTop = story.scrollHeight;
  const next = $("next");
  const after = STEPS[at + 1];
  next.hidden = !after;
  if (after) {
    next.replaceChildren(`Next: ${after.label}`, icon("chevron-right"));
    next.disabled = run.mode === "live" && run.live?.reached && STEPS.findIndex((s) => s.id === run.live.reached) <= at;
    // One dark button per screen: before a decision, that is the recommended option's Approve.
    next.classList.toggle("vc-button--secondary", step === "propose" && !run.decision);
  }
}


function agentWords(run, step) {
  const out = [];
  for (const e of run.events[step]) {
    if (e.type === "narration" && e.text?.trim()) {
      for (const para of plain(e.text).split(/\n\s*\n/)) {
        const m = LABEL.exec(para);
        out.push(m ? h("p", {}, h("strong", {}, m[1] + m[2]), para.slice(m[0].length)) : h("p", {}, para));
      }
    } else if (e.type === "tool" || e.type === "tool_result") {
      if (e.line) out.push(h("p", { class: "did" }, icon(e.name === "web_search" ? "search" : e.name === "sim_impact" ? "chart-line" : "list"), e.line));
    } else if (e.type === "notice") {
      out.push(h("p", { class: "notice", dataset: { level: e.level || "info" } }, e.text));
    }
  }
  if (run.mode === "live" && run.live?.busy && run.live.step === step) out.push(h("p", { class: "working" }, h("span", { class: "vc-spinner vc-spinner--sm", "aria-hidden": "true" }), "The agent is working on this step…"));
  if (!out.length) out.push(h("p", { class: "did" }, run.mode === "live" ? "The agent has not reached this step yet." : "Nothing in this step."));
  return out;
}

function card(run, step, hd) {
  switch (step) {
    case "spot":
      return [h("div", { class: "card" },
        h("p", { class: "card-title" }, icon("warning"), "The report, not yet confirmed"),
        h("blockquote", {}, run.scenario.seed))];
    case "check": {
      const sources = all(run, "tool", "check").concat(all(run, "tool_result", "check")).filter((e) => e.name === "web_search").flatMap((e) => e.sources || []);
      const alert = all(run, "alert", "check")[0] || all(run, "alert")[0];
      const out = [];
      if (sources.length) out.push(h("div", { class: "card" }, h("p", { class: "card-title" }, icon("search"), `${capital(plural(sources.length, "source"))} found`),
        h("ul", { class: "sources" }, sources.slice(0, 5).map((s) => h("li", {}, s.title, s.source ? h("span", { class: "src" }, ` · ${s.source}${s.representative ? ", representative" : ""}`) : null)))));
      if (alert) out.push(h("div", { class: "card card--alert", role: "status" },
        h("p", { class: "card-title" }, icon("error"), alert.basis === "what_if" ? "What-if alert: not confirmed" : `Alert, confirmed by ${words(Math.max(2, (alert.sources || []).length))} sources`),
        h("p", { class: "alert-headline" }, plain(alert.title)), h("p", {}, plain(alert.summary))));
      return out;
    }
    case "calculate": {
      const { first, last } = impacts(run);
      if (!last) return [];
      const figs = [];
      if (first && first !== last) figs.push(fig("First estimate", eurCompact(first.value_at_risk_eur), first.label ? shortLabel(first.label) : "before the check"));
      figs.push(fig(first && first !== last ? "After the check" : "At risk", eurCompact(last.value_at_risk_eur), shortLabel(last.label) || "over 30 days", "affected"));
      if (!(first && first !== last)) figs.push(fig("First line stop", last.first_stop_day === null ? "None" : days(last.first_stop_day), last.first_stop_plant_name || "within 60 days"));
      const chart = outputChart(last);
      return [h("div", { class: "impact" }, figs, chart)];
    }
    case "propose": {
      if (!run.options) return [];
      const list = h("ul", { class: "options" }, [...run.options.options, { id: "baseline", letter: "–", title: "Do nothing", ...run.options.baseline }].map((o) => optionRow(run, o, hd)));
      const out = [list];
      if (run.decision) out.push(h("p", { class: "decision" }, run.decision.id === "baseline" ? "You accepted the risk. The agent drafts a note for the plant instead of supplier requests." : `You approved option ${approved(run)?.letter}. The agent drafts the requests; nothing is sent until you approve each one.`));
      return out;
    }
    case "prepare": {
      if (!run.decision) return [h("div", { class: "card" }, h("p", { class: "card-title" }, icon("info"), "No decision yet"), h("p", {}, "The agent drafts actions only for an option you approve."), h("button", { type: "button", class: "vc-button vc-button--secondary", on: { click: () => hd.goto("propose") } }, icon("chevron-left"), "Back to Propose"))];
      const drafts = [...run.drafts.values()];
      const open = drafts.filter((d) => d.status === "pending");
      const out = [];
      if (drafts.length) out.push(h("div", { class: "drafts-bar" }, h("span", { class: "vc-tag vc-tag--feature vc-tag--sm" }, icon("sparkle"), "Drafted by the agent"), h("p", {}, icon("shield"), " Approving sends nothing."),
        open.length ? h("button", { type: "button", class: "vc-button", id: "approve-all", on: { click: () => hd.approveAll() } }, icon("check"), open.length === drafts.length ? "Approve all" : `Approve the other ${words(open.length)}`) : null));
      // Once every draft is decided, the agent's management summary closes the story, on top.
      if (run.report && !open.length) out.push(summary(run));
      out.push(h("ul", { class: "drafts" }, drafts.map((d) => draftRow(d, hd))));
      if (run.log?.length) out.push(decisionLog(run));
      return out;
    }
    default: return [];
  }
}

const fig = (label, value, note, tone) => h("div", { class: "impact-fig", dataset: tone ? { tone } : {} }, h("p", { class: "impact-label" }, label), h("p", { class: "impact-value" }, value), h("p", { class: "impact-note" }, note));
const shortLabel = (label) => String(label || "").replace(/^Initial assumption(?: from (?:the trigger|first reports))?:\s*/i, "").replace(/^.*?:\s*/, "");

/** The hit plant's daily output over the next 30 days if nothing is done: where the line stops. */
function outputChart(k) {
  const plantId = Object.entries(k.series?.baseline || {}).sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))[0];
  if (!plantId) return null;
  const [, vals] = plantId;
  if (Math.min(...vals) > 0.995) return null;
  const n = vals.length;
  const W = 300, H = 40;
  const pts = vals.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${((1 - v) * H).toFixed(1)}`);
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const add = (name, attrs) => { const e = document.createElementNS(NS, name); for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); svg.append(e); };
  add("path", { class: "area", d: `M0,${H} L${pts.join(" L")} L${W},${H} Z` });
  add("line", { class: "axis", x1: 0, y1: H, x2: W, y2: H });
  add("polyline", { class: "line", points: pts.join(" ") });
  return h("figure", { class: "output-chart" }, svg,
    h("figcaption", {}, `${k.first_stop_plant_name || "The plant"}'s output over the next ${n} days if nothing is done: lowest ${pct(Math.round(Math.min(...vals) * 100))}`));
}

function optionRow(run, o, hd) {
  const decided = run.decision?.id;
  const state = decided === o.id ? "approved" : run.rejected.has(o.id) ? "rejected" : decided ? "passed" : "open";
  const isBase = o.id === "baseline";
  const figs = isBase
    ? h("p", { class: "option-figs" }, "Keeps all ", h("strong", {}, eurCompact(o.value_at_risk_eur)), " at risk", o.first_stop_day === null ? "" : `; ${o.first_stop_plant_name} stops on day ${o.first_stop_day}`)
    : h("p", { class: "option-figs" }, "Costs ", h("strong", {}, eurCompact(o.mitigation_cost_eur)), ", leaves ", h("strong", {}, eurCompact(o.residual_var_eur)), " at risk, works in ", days(o.time_days));
  let actions;
  if (state === "approved") actions = h("span", { class: "option-tag" }, icon("check"), " Approved");
  else if (state === "rejected") actions = h("span", { class: "option-tag" }, "Rejected");
  else if (state === "passed") actions = h("span", { class: "option-tag" }, "Not chosen");
  else actions = h("div", { class: "option-actions" },
    h("button", { type: "button", class: `vc-button${o.recommended ? "" : " vc-button--secondary"}`, dataset: { option: o.id, action: "approve" }, on: { click: () => hd.decide(o.id, "approved") } }, icon("check"), isBase ? "Accept the risk" : "Approve"),
    isBase ? null : h("button", { type: "button", class: "vc-button vc-button--ghost", dataset: { option: o.id, action: "reject" }, on: { click: () => hd.decide(o.id, "rejected") } }, "Reject"));
  return h("li", { class: "option", dataset: { option: o.id, recommended: String(!!o.recommended), state } },
    h("span", { class: "option-letter", "aria-hidden": "true" }, o.letter),
    h("div", {}, h("p", { class: "option-title" }, isBase ? "Do nothing" : `Option ${o.letter}: ${o.title}`, o.recommended ? h("span", { class: "vc-tag vc-tag--feature vc-tag--sm rec-tag" }, icon("sparkle"), "Recommended") : null), figs),
    actions);
}

function draftRow(d, hd) {
  const status = d.status === "approved" ? h("span", { class: "draft-status" }, icon("check"), " Approved, not sent") : d.status === "rejected" ? h("span", { class: "draft-status" }, "Rejected") : h("span", { class: "draft-actions" },
    h("button", { type: "button", class: "vc-button vc-button--secondary", dataset: { draft: d.action_id, action: "approve" }, on: { click: () => hd.decideDraft(d.action_id, "approved") } }, "Approve"),
    h("button", { type: "button", class: "vc-button vc-button--ghost", dataset: { draft: d.action_id, action: "reject" }, on: { click: () => hd.decideDraft(d.action_id, "rejected") } }, "Reject"));
  return h("li", { class: "draft", dataset: { status: d.status } },
    h("div", { class: "draft-head" }, icon(d.kind === "booking" ? "truck" : d.kind === "replan" ? "factory" : "mail"),
      h("div", { class: "draft-what" }, h("p", { class: "draft-to" }, `${d.kind === "booking" ? "Mock booking" : d.kind === "replan" ? "Internal note" : "Email"} to ${d.recipient}`), h("p", { class: "draft-subject" }, d.subject)),
      status),
    h("details", {}, h("summary", {}, "Read the draft"), h("pre", {}, d.body)));
}

/** The management summary, from the report's Markdown: headings, paragraphs, bold, a table. */
function summary(run) {
  const drafts = [...run.drafts.values()];
  const md = String(run.report).replace(/\{\{actions\.approved\}\}/g, String(drafts.filter((d) => d.status === "approved").length)).replace(/\{\{actions\.total\}\}/g, String(drafts.length));
  const box = h("details", { class: "summary", open: true }, h("summary", {}, h("strong", {}, "Management summary"), h("span", { class: "vc-tag vc-tag--feature vc-tag--sm" }, icon("sparkle"), "Written by the agent")));
  const inline = (text) => text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((t) => (t.startsWith("**") ? h("strong", {}, t.slice(2, -2)) : t.startsWith("*") ? h("em", {}, t.slice(1, -1)) : t));
  const blocks = md.split(/\n\s*\n/);
  for (const b of blocks) {
    if (/^#+\s/.test(b)) box.append(h("h4", {}, b.replace(/^#+\s*/, "")));
    else if (/^\|/.test(b)) {
      const rows = b.split("\n").filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      box.append(h("div", { class: "vc-table-wrap" }, h("table", { class: "vc-table vc-table--compact" },
        h("thead", {}, h("tr", {}, rows[0].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", {}, rows.slice(1).map((r) => h("tr", {}, r.map((c, i) => (i ? h("td", { class: "vc-num" }, c) : h("th", { scope: "row" }, c)))))))));
    } else box.append(h("p", {}, inline(b)));
  }
  return box;
}

/** Who approved or rejected what, and when: every decision on this page, in order. */
function decisionLog(run) {
  const time = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return h("details", { class: "log" }, h("summary", {}, `Decision log: ${plural(run.log.length, "entry", "entries")}`),
    h("ol", {}, run.log.map((e) => h("li", {}, h("time", { datetime: e.at.toISOString() }, time(e.at)), ` ${e.who} ${e.what}`))));
}

// ---- the key figures ---------------------------------------------------------------------------------------

/** The four tiles: what the run shows now. setKpi(name, { value, note, tone }) is the shell's. */
export function renderKpis(run, setKpi) {
  const { last } = impacts(run);
  const opt = approved(run);
  if (!last) {
    setKpi("Value at risk", { value: "Step 3", note: "the agent calculates it", tone: "muted" });
    setKpi("First line stop in", { value: "Step 3", note: "the agent calculates it", tone: "muted" });
  } else if (run.decision?.id === "baseline") {
    setKpi("Value at risk", { value: eurCompact(last.value_at_risk_eur), note: "risk accepted, 30 days", tone: "affected" });
    setKpi("First line stop in", { value: last.first_stop_day === null ? "None" : days(last.first_stop_day), note: `${last.first_stop_plant_name || "no plant"}, risk accepted`, tone: last.first_stop_day === null ? "resolved" : "affected" });
  } else if (opt) {
    setKpi("Value at risk", { value: eurCompact(opt.residual_var_eur), note: `left with option ${opt.letter}, was ${eurCompact(last.value_at_risk_eur)}`, tone: opt.residual_var_eur > 0 ? "at_risk" : "resolved" });
    setKpi("First line stop in", opt.first_stop_day === null
      ? { value: "None", note: `no line stop with option ${opt.letter}`, tone: "resolved" }
      : { value: days(opt.first_stop_day), note: `${opt.first_stop_plant_name} slows to ${pct(opt.min_output_pct)} at worst`, tone: "at_risk" });
  } else {
    setKpi("Value at risk", { value: eurCompact(last.value_at_risk_eur), note: "if nothing is done, 30 days", tone: last.value_at_risk_eur > 0 ? "affected" : "resolved" });
    setKpi("First line stop in", last.first_stop_day === null
      ? { value: "None", note: "no line stop within 60 days", tone: "resolved" }
      : { value: days(last.first_stop_day), note: `${last.first_stop_plant_name}, if nothing is done`, tone: "affected" });
  }
}
