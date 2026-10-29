// Bottom drawer shell: tabs (Options, Outbox, Audit), counts, open/close, and Vici's byline in the
// middle of the bar: "Built by", Victor's hexagon portrait and name, and his LinkedIn and website.

import { h } from "./dom.js";
import { icon } from "./icons.js";

/**
 * Vici's byline, as on all of Victor's pages. The portrait and LinkedIn's logo are Vici's files in
 * vici/assets/ (the content security policy allows no image from another site); either link opens
 * in a new tab, so a running demo is never left.
 */
function byline() {
  return h("p", { class: "vc-byline" },
    h("span", { class: "vc-byline__label" }, "Built by"),
    h("span", { class: "vc-byline__person" },
      h("span", { class: "vc-avatar vc-avatar--xs" }, h("img", { src: "vici/assets/brand/portrait-96.jpg", alt: "", width: "96", height: "96" })),
      h("span", { class: "vc-byline__name" }, "Victor Pflüger")),
    h("span", { class: "vc-byline__links" },
      h("a", { class: "vc-byline__icon", href: "https://www.linkedin.com/in/victorpflueger", target: "_blank", rel: "author noopener", "aria-label": "Victor Pflüger on LinkedIn (opens in a new tab)" },
        h("img", { class: "vc-platform-mark", src: "vici/assets/marks/linkedin.png", alt: "", width: "840", height: "779" })),
      h("a", { class: "vc-byline__icon", href: "https://victorpflueger.github.io/VIP/index.html", target: "_blank", rel: "author noopener", "aria-label": "Victor Pflüger's website (opens in a new tab)" },
        h("span", { class: "vc-icon vc-icon--globe-hex", "aria-hidden": "true" }))));
}

const TABS = [
  { id: "options", label: "Options" },
  { id: "outbox", label: "Outbox" },
  { id: "audit", label: "Audit" }
];

export function createDrawer(root, { onToggle } = {}) {
  const tabs = new Map();
  const panels = new Map();
  // The bar holds three groups: the tabs on the left, the byline in the middle, the note and the
  // toggle on the right. Only the tabs form the tab list.
  const tabBar = h("div", { class: "drawer-tabs" });
  // Vici's tab list; this module owns the tabs (a click on the open tab closes the drawer), so the
  // list has no .vc-tabs around it for vici.js to bind.
  const tabList = h("div", { class: "vc-tabs__list drawer-tablist", role: "tablist", "aria-label": "Decision drawer" });
  const body = h("div", { class: "drawer-body" });
  let active = "options";
  let open = false;

  for (const t of TABS) {
    const count = h("span", { class: "vc-badge count", hidden: true }, "0");
    const btn = h("button", {
      class: "drawer-tab", type: "button", role: "tab", id: `tab-${t.id}`,
      "aria-selected": "false", "aria-controls": `panel-${t.id}`
    }, t.label, count);
    btn.addEventListener("click", () => {
      if (open && active === t.id) setOpen(false);
      else show(t.id);
    });
    tabs.set(t.id, { btn, count });
    tabList.appendChild(btn);
    const panel = h("div", { class: "drawer-panel", id: `panel-${t.id}`, role: "tabpanel", "aria-labelledby": `tab-${t.id}`, hidden: true });
    panels.set(t.id, panel);
    body.appendChild(panel);
  }

  const toggleBtn = h("button", { class: "vc-button vc-button--ghost button-compact drawer-toggle", type: "button", "aria-label": "Show or hide the drawer" }, icon("chevronUp", 18), h("span", {}, "Show"));
  toggleBtn.addEventListener("click", () => setOpen(!open));
  tabBar.append(
    tabList,
    byline(),
    h("div", { class: "drawer-end" },
      h("span", { class: "drawer-note" }, icon("shield", 16), "Actions stay drafts until you approve them and are never sent to anyone."),
      toggleBtn)
  );

  root.append(tabBar, body);
  root.dataset.open = "false";

  function show(id) {
    active = id;
    for (const [tid, t] of tabs) t.btn.setAttribute("aria-selected", String(tid === id));
    for (const [pid, p] of panels) p.hidden = pid !== id;
    setOpen(true);
  }

  function setOpen(v) {
    open = v;
    root.dataset.open = String(v);
    toggleBtn.replaceChildren(icon(v ? "chevronDown" : "chevronUp", 18), h("span", {}, v ? "Hide" : "Show"));
    if (v) for (const [tid, t] of tabs) t.btn.setAttribute("aria-selected", String(tid === active));
    else for (const t of tabs.values()) t.btn.setAttribute("aria-selected", "false");
    if (v) for (const [pid, p] of panels) p.hidden = pid !== active;
    onToggle?.(v);
  }

  function setCount(id, n, attention = false) {
    const t = tabs.get(id);
    if (!t) return;
    t.count.hidden = !n;
    t.count.textContent = String(n);
    t.count.dataset.tone = attention ? "attention" : "";
    // A count that needs your decision is a merlot badge; the others stay quiet.
    t.count.classList.toggle("badge-quiet", !attention);
  }

  return { panel: (id) => panels.get(id), show, setOpen, setCount, isOpen: () => open, active: () => active };
}
