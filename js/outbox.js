// Outbox tab: drafted emails, freight bookings and production re-plans. Every item is a draft
// that needs explicit approval; approval only changes its status here — nothing is ever sent.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";

const TYPE = {
  email: { icon: "mail", label: "Email draft" },
  booking: { icon: "truck", label: "Freight booking (mock)" },
  replan: { icon: "calendar", label: "Production re-plan" }
};

export function createOutbox(panel, { onDecision, onCount } = {}) {
  const actions = new Map(); // id -> { draft, status: "pending" | "approved" | "rejected" | "expired" }

  function counts() {
    const pending = [...actions.values()].filter((a) => a.status === "pending").length;
    onCount?.(actions.size, pending > 0);
  }

  function render() {
    clear(panel);
    const pending = [...actions.values()].filter((a) => a.status === "pending");
    panel.appendChild(h("div", { class: "outbox-head" },
      h("span", { class: "outbox-safety" }, icon("shield", 18), "Drafts only. Navigator has no email or booking integration; approving marks a draft as cleared for sending."),
      pending.length > 1
        ? h("button", { class: "btn btn-approve btn-sm", type: "button", on: { click: () => pending.forEach((a) => decide(a.draft, "approved")) } }, icon("check", 16), `Approve all ${pending.length} pending`)
        : null));

    if (!actions.size) {
      panel.appendChild(h("div", { class: "empty" },
        h("strong", {}, "Nothing drafted yet"),
        h("span", {}, "After you approve an option, the agent drafts the supplier emails and freight bookings needed to execute it. Each draft waits here for your approval.")));
      return;
    }

    const list = h("div", { class: "outbox-list" });
    for (const { draft, status } of actions.values()) list.appendChild(card(draft, status));
    panel.appendChild(list);
  }

  function card(d, status) {
    const t = TYPE[d.type] || TYPE.email;
    const tone = status === "pending" ? "pending" : status;
    const statusText = status === "pending" ? "Pending approval"
      : status === "approved" ? "Approved — draft, not sent"
        : status === "expired" ? "Not decided: the run ended" : "Rejected";
    const bodyText = d.body || (d.payload ? JSON.stringify(d.payload, null, 2) : "");
    const clipped = bodyText.split("\n").length > 6 || bodyText.length > 480;
    const el = h("article", { class: "action-card", dataset: { status, expanded: "false", clipped: String(clipped) } },
      h("span", { class: "action-type", "aria-hidden": "true" }, icon(t.icon, 20)),
      h("div", {},
        h("div", { class: "action-meta" },
          h("span", {}, t.label),
          h("span", {}, `To: ${d.recipient}`),
          h("span", { class: "chip", dataset: { tone } }, statusText)),
        h("div", { class: "action-subject" }, d.subject),
        h("pre", { class: "action-body" }, bodyText),
        clipped
          ? h("button", { class: "btn btn-ghost btn-sm action-more", type: "button", on: { click: (e) => {
            const open = el.dataset.expanded !== "true";
            el.dataset.expanded = String(open);
            e.currentTarget.textContent = open ? "Show less" : "Show full draft";
          } } }, "Show full draft")
          : null),
      status === "pending"
        ? h("div", { class: "action-buttons" },
          h("button", { class: "btn btn-approve", type: "button", on: { click: () => decide(d, "approved") } }, icon("check", 18), "Approve"),
          h("button", { class: "btn btn-danger", type: "button", on: { click: () => decide(d, "rejected") } }, "Reject"))
        : h("div", { class: "action-buttons" }));
    return el;
  }

  function decide(d, decision) {
    const a = actions.get(d.action_id);
    if (!a || a.status !== "pending") return;
    onDecision?.({ action_id: d.action_id, decision, label: `${(TYPE[d.type] || TYPE.email).label.toLowerCase()} “${d.subject}”` });
  }

  bus.on("action_draft", (ev) => {
    actions.set(ev.payload.action_id, { draft: ev.payload, status: "pending" });
    render();
    counts();
  });

  bus.on("action_decision", (ev) => {
    const a = actions.get(ev.payload.action_id);
    if (!a) return;
    a.status = ev.payload.decision;
    render();
    counts();
  });

  // Drafts still pending when a run ends (abort, error) can no longer be decided; nothing was sent.
  bus.on("run_end", () => {
    let changed = false;
    for (const a of actions.values()) if (a.status === "pending") { a.status = "expired"; changed = true; }
    if (changed) { render(); counts(); }
  });

  function reset() {
    actions.clear();
    render();
    counts();
  }

  render();
  return {
    reset,
    pendingIds: () => [...actions.entries()].filter(([, a]) => a.status === "pending").map(([id]) => id),
    statusOf: (id) => actions.get(id)?.status || null
  };
}
