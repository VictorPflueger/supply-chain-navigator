/* Applies the theme before the page is drawn, so a dark choice doesn't flash light first. Light is the
 * default, because the prototypes are mostly shown on projectors in lit rooms: the page turns dark only
 * if the visitor chose dark with the header's toggle. vici/dist/vici.js does the rest: the toggle itself
 * and remembering the choice under "vc-theme", the key all of Victor's pages on victorpflueger.github.io
 * share. A plain script in the head, not deferred, and not a module: it has to run first.
 */
(function () {
  "use strict";
  var theme = "light";
  try {
    if (window.localStorage.getItem("vc-theme") === "dark") theme = "dark";
  } catch (e) {
    /* storage is blocked: the light theme */
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
