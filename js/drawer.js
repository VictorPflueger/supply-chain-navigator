// Bottom drawer shell: tabs (Options, Outbox, Audit), counts, open/close, and the author's credit in
// the middle of the bar (a link to his website and one to LinkedIn).

import { h } from "./dom.js";
import { icon } from "./icons.js";

// The author's credit. The photo is a local file: the content security policy allows no image from
// another site, and a click on either link opens it in a new tab, so a running demo is never left.
const AUTHOR = {
  name: "Victor Pflüger",
  site: "https://victorpflueger.github.io/VIP/",
  linkedin: "https://www.linkedin.com/in/victorpflueger",
  photo: "images/author.jpg"
};

const TABS = [
  { id: "options", label: "Options" },
  { id: "outbox", label: "Outbox" },
  { id: "audit", label: "Audit" }
];

export function createDrawer(root, { onToggle } = {}) {
  const tabs = new Map();
  const panels = new Map();
  // The bar holds three groups: the tabs on the left, the credit in the middle, the note and the
  // toggle on the right. Only the tabs form the tab list.
  const tabBar = h("div", { class: "drawer-tabs" });
  const tabList = h("div", { class: "drawer-tablist", role: "tablist", "aria-label": "Decision drawer" });
  const body = h("div", { class: "drawer-body" });
  let active = "options";
  let open = false;

  for (const t of TABS) {
    const count = h("span", { class: "count num", hidden: true }, "0");
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

  const toggleBtn = h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": "Show or hide the drawer" }, icon("chevronUp", 18), h("span", {}, "Show"));
  toggleBtn.addEventListener("click", () => setOpen(!open));
  const credit = h("p", { class: "drawer-credit" },
    h("span", { class: "credit-label" }, "Built by"),
    h("a", { class: "credit-person", href: AUTHOR.site, target: "_blank", rel: "noopener", "aria-label": `${AUTHOR.name}, website (opens in a new tab)` },
      h("img", { class: "credit-photo", src: AUTHOR.photo, alt: "", width: "28", height: "28", decoding: "async" }),
      h("span", { class: "credit-name" }, AUTHOR.name)),
    h("a", { class: "credit-linkedin", href: AUTHOR.linkedin, target: "_blank", rel: "noopener", "aria-label": `${AUTHOR.name} on LinkedIn (opens in a new tab)` },
      icon("linkedin", 18)));
  tabBar.append(
    tabList,
    credit,
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
  }

  return { panel: (id) => panels.get(id), show, setOpen, setCount, isOpen: () => open, active: () => active };
}
