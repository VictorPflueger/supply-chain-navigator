// Accessible modal dialog: focus trap, Escape to close, focus restore, labelled by its title.

import { h } from "./dom.js";
import { icon } from "./icons.js";

let openCount = 0;

/**
 * Opens a modal. Returns { el, close }.
 * opts: { title, intro, body (Node|Node[]), footer (Node|Node[]), size: "narrow"|"wide"|"", dismissible, onClose }
 */
export function openModal({ title, intro = "", body = [], footer = [], size = "", dismissible = true, onClose, className = "" } = {}) {
  const id = `modal-${Date.now().toString(36)}-${++openCount}`;
  const previous = document.activeElement;
  const closeBtn = dismissible
    ? h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "Close dialog", title: "Close" }, icon("x", 20))
    : null;
  const dialog = h("div", { class: `modal ${size} ${className}`.trim(), role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-title` },
    h("div", { class: "modal-head" },
      h("div", {}, h("h2", { id: `${id}-title` }, title), intro ? h("p", {}, intro) : null),
      closeBtn),
    h("div", { class: "modal-body" }, body),
    footer && (!Array.isArray(footer) || footer.length) ? h("div", { class: "modal-foot" }, footer) : null);
  const backdrop = h("div", { class: "modal-backdrop" }, dialog);

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
    if (previous && typeof previous.focus === "function") previous.focus();
    onClose?.(result);
  }

  function onKey(e) {
    if (e.key === "Escape" && dismissible) {
      e.preventDefault();
      close(null);
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = [...dialog.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  closeBtn?.addEventListener("click", () => close(null));
  if (dismissible) backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(null); });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(backdrop);

  const autofocus = dialog.querySelector("[autofocus]") || dialog.querySelector(".modal-body button, .modal-body input, .modal-body textarea") || closeBtn;
  setTimeout(() => autofocus?.focus(), 0);
  return { el: dialog, close };
}
