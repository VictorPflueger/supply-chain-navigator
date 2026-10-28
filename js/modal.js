// Accessible modal dialog on Vici's vc-dialog: a native <dialog> shown with showModal(), labelled by
// its title. The app owns its behaviour, not vici.js (data-vc-dismissable="false" keeps Vici from
// closing it on a backdrop click): a dismissible dialog closes with its close button, Escape or a
// press on the backdrop; one without a close button (a decision, a typed key) only through its own
// buttons. Focus stays inside it (Tab wraps) and goes back to where it was.

import { h, withTooltip } from "./dom.js";
import { icon } from "./icons.js";

let openCount = 0;

/**
 * Opens a modal. Returns { el, close }.
 * opts: { title, intro, body (Node|Node[]), footer (Node|Node[]), size: "narrow"|"wide"|"intro"|"", dismissible, onClose }
 */
export function openModal({ title, intro = "", body = [], footer = [], size = "", dismissible = true, onClose, className = "" } = {}) {
  const id = `modal-${Date.now().toString(36)}-${++openCount}`;
  const previous = document.activeElement;
  const closeBtn = dismissible ? h("button", { class: "vc-icon-button dialog-close", type: "button" }, icon("x", 20)) : null;
  const dialog = h("dialog", {
    class: ["vc-dialog", size ? `dialog-${size}` : "", className],
    "aria-labelledby": `${id}-title`, "data-vc-dismissable": "false"
  },
  h("div", { class: "vc-dialog__header" },
    h("div", { class: "dialog-heading" }, h("h2", { class: "vc-dialog__title", id: `${id}-title` }, title), intro ? h("p", { class: "dialog-lead" }, intro) : null),
    closeBtn ? withTooltip(closeBtn, "Close dialog", { below: true }) : null),
  h("div", { class: "vc-dialog__body" }, body),
  footer && (!Array.isArray(footer) || footer.length) ? h("div", { class: "vc-dialog__footer" }, footer) : null);

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    if (dialog.open) dialog.close();
    dialog.remove();
    if (previous && typeof previous.focus === "function") previous.focus();
    onClose?.(result);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      // The dialog decides: a cancelled keydown never reaches the browser's own close request.
      e.preventDefault();
      if (dismissible) close(null);
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
  // The browser's own close request (Escape) is the app's to decide, as above.
  dialog.addEventListener("cancel", (e) => e.preventDefault());
  // A press on the backdrop closes a dismissible dialog (the dialog element itself, outside its box).
  if (dismissible) {
    dialog.addEventListener("mousedown", (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(null);
    });
  }
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(dialog);
  dialog.showModal();

  const autofocus = dialog.querySelector("[autofocus]") || dialog.querySelector(".vc-dialog__body button, .vc-dialog__body input, .vc-dialog__body textarea") || closeBtn;
  setTimeout(() => autofocus?.focus(), 0);
  return { el: dialog, close };
}
