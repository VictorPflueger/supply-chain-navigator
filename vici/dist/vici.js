/*!
 * Vici — small behaviours for the Vici design system.
 * No dependencies. Load with <script src="dist/vici.js" defer></script>.
 * Everything works without it except: theme toggle, tabs, toasts, dialog triggers,
 * the mobile header menu (without it the links stay visible), menu positioning (menus
 * open centred), slider fill, carousel dots, table sorting and copy buttons. Tooltips work
 * without it too; with it they move to the top layer, so no container can clip them.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'vc-theme';
  var root = document.documentElement;
  root.classList.add('vc-js');

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusable(el) {
    return !!el && el.isConnected && el.matches && el.matches(FOCUSABLE) && !el.closest('[inert]');
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* storage blocked: the choice simply is not remembered */ }
  }
  function $all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /* ---------------------------------------------------------------- theme */
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolvedTheme() {
    var explicit = root.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return media && media.matches ? 'dark' : 'light';
  }

  // A theme toggle is a toggle button for the dark theme: its name stays the author's
  // ("Dark theme", "Dunkles Design") and aria-pressed carries the state.
  function syncThemeControls() {
    var current = resolvedTheme();
    var setting = root.getAttribute('data-theme') || 'system';
    $all('[data-vc-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(current === 'dark'));
    });
    $all('[data-vc-theme-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-vc-theme-set') === setting));
    });
  }

  function setTheme(value) {
    if (value === 'light' || value === 'dark') {
      root.setAttribute('data-theme', value);
      storageSet(STORAGE_KEY, value);
    } else {
      root.removeAttribute('data-theme');
      storageSet(STORAGE_KEY, null);
    }
    syncThemeControls();
    document.dispatchEvent(new CustomEvent('vc:themechange', { detail: { theme: resolvedTheme() } }));
  }

  // Apply a stored choice as early as possible (an inline copy of these lines in <head> avoids a flash).
  var stored = storageGet(STORAGE_KEY);
  if ((stored === 'light' || stored === 'dark') && !root.hasAttribute('data-theme')) {
    root.setAttribute('data-theme', stored);
  }
  if (media && media.addEventListener) media.addEventListener('change', syncThemeControls);

  /* ---------------------------------------------------------------- toast */
  function makeRegion(parent) {
    var region = document.createElement('div');
    region.className = 'vc-toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-relevant', 'additions');
    parent.appendChild(region);
    return region;
  }
  function pageRegion() {
    return document.querySelector('body > .vc-toast-region') || makeRegion(document.body);
  }
  // While a modal dialog is open, everything outside it is inert, so toasts go into a region
  // inside the dialog. When the dialog closes, its toasts move back to the page region.
  function topModal() {
    var modals;
    try { modals = document.querySelectorAll('dialog:modal'); } catch (e) { return null; }
    return modals.length ? modals[modals.length - 1] : null;
  }
  function toastRegion() {
    var dialog = topModal();
    if (!dialog) return pageRegion();
    var region = dialog.querySelector(':scope > .vc-toast-region');
    if (!region) {
      region = makeRegion(dialog);
      dialog.addEventListener('close', function () {
        var target = pageRegion();
        $all('.vc-toast', region).forEach(function (t) { target.appendChild(t); });
        region.remove();
      }, { once: true });
    }
    return region;
  }

  var TONE_ICON = { info: 'info', success: 'success', warning: 'warning', danger: 'error', feature: 'sparkle' };

  function dismissToast(el) {
    if (!el || el.hasAttribute('data-leaving')) return;
    el.setAttribute('data-leaving', '');
    // keep keyboard users where they were when the toast appeared
    if (el.contains(document.activeElement)) {
      var back = el.__vcReturnFocus;
      if (focusable(back)) back.focus();
      else document.body.focus();
    }
    window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reducedMotion() ? 0 : 260);
  }

  /**
   * Vici.toast('Saved') or Vici.toast({ title, message, tone: 'success', duration: 5000 })
   * duration: 0 (or Infinity) keeps the toast until it is closed. Returns the toast element,
   * or null when there is nothing to show.
   */
  function toast(options) {
    var opts = options;
    if (typeof options === 'string' || typeof options === 'number') opts = { title: String(options) };
    if (!opts || typeof opts !== 'object') return null;
    var titleText = opts.title == null ? '' : String(opts.title);
    var messageText = opts.message == null ? '' : String(opts.message);
    if (!titleText && !messageText) return null;
    var tone = TONE_ICON[opts.tone] ? opts.tone : 'info';
    var el = document.createElement('div');
    el.className = 'vc-toast vc-toast--' + tone;
    el.setAttribute('role', tone === 'danger' ? 'alert' : 'status');

    var icon = document.createElement('span');
    icon.className = 'vc-icon vc-icon--' + (TONE_ICON[tone] || 'info');
    icon.setAttribute('aria-hidden', 'true');

    var body = document.createElement('div');
    body.className = 'vc-toast__body';
    if (titleText) {
      var title = document.createElement('p');
      title.className = 'vc-toast__title';
      title.textContent = titleText;
      body.appendChild(title);
    }
    if (messageText) {
      var msg = document.createElement('p');
      msg.textContent = messageText;
      body.appendChild(msg);
    }

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'vc-icon-button vc-icon-button--sm';
    close.setAttribute('aria-label', opts.closeLabel || 'Dismiss notification');
    close.innerHTML = '<span class="vc-icon vc-icon--close" aria-hidden="true"></span>';
    close.addEventListener('click', function () { dismissToast(el); });

    el.appendChild(icon);
    el.appendChild(body);
    el.appendChild(close);
    el.__vcReturnFocus = document.activeElement;
    var region = toastRegion();
    // a live region that was just created needs a moment before additions are announced
    if (region.childElementCount || region.__vcReady) region.appendChild(el);
    else window.setTimeout(function () { region.appendChild(el); }, 60);
    region.__vcReady = true;

    var duration = opts.duration === undefined ? 5000 : Number(opts.duration);
    // timers overflow above 2^31 - 1 ms (about 24 days) and would fire at once: treat as "until closed"
    if (isFinite(duration) && duration > 0 && duration <= 2147483647) {
      // the toast waits while it is hovered or holds focus, and leaves 2 s after both end
      var hovered = false;
      var focused = false;
      var timer = 0;
      var arm = function (ms) {
        window.clearTimeout(timer);
        timer = window.setTimeout(function () { if (!hovered && !focused) dismissToast(el); }, ms);
      };
      el.addEventListener('mouseenter', function () { hovered = true; window.clearTimeout(timer); });
      el.addEventListener('mouseleave', function () { hovered = false; if (!focused) arm(2000); });
      el.addEventListener('focusin', function () { focused = true; window.clearTimeout(timer); });
      el.addEventListener('focusout', function (e) {
        if (el.contains(e.relatedTarget)) return;
        focused = false;
        if (!hovered) arm(2000);
      });
      arm(duration);
    }
    return el;
  }

  /* ----------------------------------------------------------------- tabs */
  function initTabs(scope) {
    $all('.vc-tabs', scope).forEach(function (tabsEl) {
      if (tabsEl.__vcTabs) return;
      tabsEl.__vcTabs = true;
      var tabs = $all('[role="tab"]', tabsEl);
      function select(tab, focus) {
        tabs.forEach(function (t) {
          var selected = t === tab;
          t.setAttribute('aria-selected', String(selected));
          t.tabIndex = selected ? 0 : -1;
          var panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !selected;
        });
        if (focus) tab.focus();
        tabsEl.dispatchEvent(new CustomEvent('vc:tabchange', { detail: { tab: tab } }));
      }
      var initial = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      if (initial) select(initial, false);
      tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { select(tab, false); });
        tab.addEventListener('keydown', function (e) {
          var next = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
          if (e.key === 'Home') next = tabs[0];
          if (e.key === 'End') next = tabs[tabs.length - 1];
          if (next) { e.preventDefault(); select(next, true); }
        });
      });
    });
  }

  /* -------------------------------------------------------------- sliders */
  function updateSlider(input) {
    var min = parseFloat(input.min || '0');
    var max = parseFloat(input.max || '100');
    var val = parseFloat(input.value);
    var ratio = max > min ? Math.min(1, Math.max(0, (val - min) / (max - min))) : 0;
    // CSS turns the ratio into a fill that ends under the centre of the thumb
    input.style.setProperty('--vc-slider-value', String(ratio));
    if (input.id) {
      $all('output[for~="' + input.id + '"]').forEach(function (out) { out.textContent = input.value; });
    }
  }
  function initSliders(scope) {
    $all('input.vc-slider', scope).forEach(updateSlider);
  }

  /* ---------------------------------------------------------------- menus */
  function positionPopover(pop, invoker) {
    if (!invoker) return;
    var r = invoker.getBoundingClientRect();
    var gap = 6;
    var w = pop.offsetWidth;
    var h = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + gap;
    if (top + h > window.innerHeight - 8 && r.top - gap - h > 8) top = r.top - gap - h;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  var openPopovers = [];
  function invokerFor(pop) {
    return document.querySelector('[popovertarget="' + pop.id + '"]');
  }
  function onScrollOrResize() {
    openPopovers.forEach(function (pop) { positionPopover(pop, invokerFor(pop)); });
  }
  function menuItems(menu) {
    return $all('.vc-menu__item:not([disabled]):not([aria-disabled="true"])', menu);
  }
  function initPopovers(scope) {
    $all('.vc-menu[popover], .vc-popover[popover]', scope).forEach(function (pop) {
      if (pop.__vcPopover) return;
      pop.__vcPopover = true;
      pop.addEventListener('toggle', function (e) {
        var invoker = invokerFor(pop);
        var open = e.newState === 'open';
        if (invoker) invoker.setAttribute('aria-expanded', String(open));
        if (open) {
          positionPopover(pop, invoker);
          openPopovers.push(pop);
          if (pop.classList.contains('vc-menu')) {
            var items = menuItems(pop);
            if (items[0]) items[0].focus();
          }
        } else {
          openPopovers = openPopovers.filter(function (p) { return p !== pop; });
        }
      });
      if (!pop.classList.contains('vc-menu')) return;
      pop.addEventListener('keydown', function (e) {
        var items = menuItems(pop);
        var i = items.indexOf(document.activeElement);
        var next = null;
        if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
        if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
        if (e.key === 'Home') next = items[0];
        if (e.key === 'End') next = items[items.length - 1];
        if (next) { e.preventDefault(); next.focus(); }
        if (e.key === 'Tab') pop.hidePopover();
      });
      pop.addEventListener('click', function (e) {
        var item = e.target.closest('.vc-menu__item');
        if (!item || pop.hasAttribute('data-vc-keep-open')) return;
        if (item.getAttribute('role') === 'menuitemradio') {
          menuItems(pop).forEach(function (it) {
            if (it.getAttribute('role') === 'menuitemradio') it.setAttribute('aria-checked', String(it === item));
          });
        }
        if (item.getAttribute('role') === 'menuitemcheckbox') {
          item.setAttribute('aria-checked', String(item.getAttribute('aria-checked') !== 'true'));
          return;
        }
        pop.hidePopover();
        var invoker = invokerFor(pop);
        if (invoker) invoker.focus();
      });
    });
  }
  window.addEventListener('resize', onScrollOrResize);
  window.addEventListener('scroll', onScrollOrResize, true);

  /* ------------------------------------------------------------- tooltips */
  // Without this, tooltips are plain CSS (shown on hover and focus). With it, a tooltip becomes
  // a manual popover in the top layer: no overflow can clip it, and it stays open while the
  // pointer moves onto it (WCAG 1.4.13: hoverable, dismissible with Esc, persistent).
  var popoverSupport = typeof HTMLElement !== 'undefined' && HTMLElement.prototype.hasOwnProperty('popover');
  var openTips = [];
  function placeTooltip(tip, anchor) {
    var target = null;
    for (var c = anchor.firstElementChild; c; c = c.nextElementSibling) { if (c !== tip) { target = c; break; } }
    var r = (target || anchor).getBoundingClientRect();
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var gap = 10;
    var below = tip.classList.contains('vc-tooltip--bottom');
    var top = below ? r.bottom + gap : r.top - gap - h;
    if (!below && top < 8) { below = true; top = r.bottom + gap; }
    else if (below && top + h > window.innerHeight - 8 && r.top - gap - h > 8) { below = false; top = r.top - gap - h; }
    var center = r.left + r.width / 2;
    var left = Math.min(Math.max(8, center - w / 2), window.innerWidth - w - 8);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.setProperty('--_arrow-x', (center - left) + 'px');
    tip.toggleAttribute('data-below', below);
  }
  function initTooltips(scope) {
    if (!popoverSupport) return;
    $all('.vc-tooltip-anchor', scope).forEach(function (anchor) {
      var tip = anchor.querySelector(':scope > .vc-tooltip');
      if (!tip || tip.__vcTip) return;
      tip.__vcTip = true;
      tip.setAttribute('popover', 'manual');
      var hideTimer = 0;
      var showTimer = 0;
      function show() {
        window.clearTimeout(hideTimer);
        if (anchor.hasAttribute('data-dismissed') || tip.matches(':popover-open')) return;
        window.clearTimeout(showTimer);
        showTimer = window.setTimeout(function () {
          if (anchor.hasAttribute('data-dismissed') || !anchor.isConnected) return;
          tip.showPopover();
          placeTooltip(tip, anchor);
          openTips.push([tip, anchor]);
        }, 100);
      }
      function hide(delay) {
        window.clearTimeout(showTimer);
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(function () {
          if (tip.matches(':popover-open')) tip.hidePopover();
          openTips = openTips.filter(function (p) { return p[0] !== tip; });
        }, delay);
      }
      tip.__vcHide = function () { hide(0); };
      anchor.addEventListener('mouseenter', show);
      anchor.addEventListener('mouseleave', function () { if (!anchor.contains(document.activeElement)) hide(150); });
      anchor.addEventListener('focusin', show);
      anchor.addEventListener('focusout', function (e) { if (!anchor.contains(e.relatedTarget) && !anchor.matches(':hover')) hide(0); });
      // Using the control answers the tooltip: it closes until the pointer or focus leaves. A tap
      // on a phone never shows it, and a menu that the button opens isn't covered by it.
      anchor.addEventListener('click', function () {
        anchor.setAttribute('data-dismissed', '');
        hide(0);
      });
    });
  }
  function placeOpenTips() {
    openTips.forEach(function (p) { placeTooltip(p[0], p[1]); });
  }
  window.addEventListener('resize', placeOpenTips);
  window.addEventListener('scroll', placeOpenTips, true);

  /* ------------------------------------------------------- scroll regions */
  // Tables, charts and code that scroll must be reachable by keyboard (WCAG 2.1.1): while a
  // wrapper actually overflows it becomes focusable. When it has a caption or chart title it is
  // also a named region (names are kept unique); otherwise it stays an unnamed, focusable box.
  var regionNames = {};
  function regionLabel(el) {
    var cap = el.querySelector('caption, .vc-chart__title');
    if (!cap) { var chart = el.closest('.vc-chart'); cap = chart && chart.querySelector('.vc-chart__title'); }
    var text = cap ? cap.textContent.replace(/\s+/g, ' ').trim() : '';
    if (!text) return '';
    var n = regionNames[text] = (regionNames[text] || 0) + 1;
    return n > 1 ? text + ' (' + n + ')' : text;
  }
  function syncScrollRegion(el) {
    var scrolls = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (scrolls && !el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '0');
      el.__vcRegion = true;
      if (el.tagName !== 'PRE' && !el.hasAttribute('role') && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
        if (el.__vcLabel === undefined) el.__vcLabel = regionLabel(el);
        if (el.__vcLabel) {
          el.setAttribute('role', 'region');
          el.setAttribute('aria-label', el.__vcLabel);
          el.__vcNamed = true;
        }
      }
    } else if (!scrolls && el.__vcRegion) {
      el.removeAttribute('tabindex');
      if (el.__vcNamed) { el.removeAttribute('role'); el.removeAttribute('aria-label'); el.__vcNamed = false; }
      el.__vcRegion = false;
    }
  }
  var regionObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(function (entries) { entries.forEach(function (en) { syncScrollRegion(en.target); }); })
    : null;
  function initScrollRegions(scope) {
    $all('.vc-table-wrap, .vc-chart__plot, pre', scope).forEach(function (el) {
      if (el.__vcScroll) return;
      el.__vcScroll = true;
      syncScrollRegion(el);
      if (regionObserver) regionObserver.observe(el);
    });
  }

  /* ------------------------------------------------------------- carousel */
  function initCarousels(scope) {
    $all('[data-vc-carousel]', scope).forEach(function (car) {
      if (car.__vcCarousel) return;
      car.__vcCarousel = true;
      var track = car.querySelector('.vc-carousel__track');
      if (!track) return;
      var slides = $all('.vc-carousel__slide', track);
      var dotsWrap = car.querySelector('.vc-carousel__dots');
      var dots = [];
      if (dotsWrap) {
        dotsWrap.innerHTML = '';
        slides.forEach(function (slide, i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', 'Show slide ' + (i + 1) + ' of ' + slides.length);
          b.addEventListener('click', function () { go(i); });
          dotsWrap.appendChild(b);
          dots.push(b);
        });
      }
      function current() {
        var x = track.scrollLeft;
        var best = 0;
        slides.forEach(function (s, i) {
          if (Math.abs(s.offsetLeft - track.offsetLeft - x) < Math.abs(slides[best].offsetLeft - track.offsetLeft - x)) best = i;
        });
        return best;
      }
      function go(i) {
        var n = Math.max(0, Math.min(slides.length - 1, i));
        track.scrollTo({ left: slides[n].offsetLeft - track.offsetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
      function sync() {
        var c = current();
        dots.forEach(function (d, i) { d.setAttribute('aria-current', String(i === c)); });
        slides.forEach(function (s, i) { s.setAttribute('aria-hidden', String(i !== c)); s.inert = i !== c; });
      }
      var prev = car.querySelector('[data-vc-prev]');
      var next = car.querySelector('[data-vc-next]');
      if (prev) prev.addEventListener('click', function () { go(current() - 1); });
      if (next) next.addEventListener('click', function () { go(current() + 1); });
      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
      });
      var raf = 0;
      track.addEventListener('scroll', function () {
        window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(sync);
      });
      sync();
    });
  }

  /* ---------------------------------------------------------- table sort */
  // Sort key for a cell: its data-value if present (use this for localised numbers),
  // otherwise the text — read as a number when it looks like one (1,234.5 · 12% · € 40).
  function cellValue(row, index) {
    var cell = row.children[index];
    if (!cell) return '';
    var raw = cell.getAttribute('data-value');
    if (raw === null) raw = cell.textContent.trim();
    var cleaned = raw.replace(/[€$£%\s\u2009\u202f]/g, '').replace(/[\u2212\u2013]/g, '-');
    if (/^-?[\d.,]+$/.test(cleaned)) {
      var n = parseFloat(cleaned.replace(/,/g, ''));
      if (!isNaN(n)) return n;
    }
    return raw.toLowerCase();
  }
  function initTables(scope) {
    $all('table[data-vc-sortable]', scope).forEach(function (table) {
      if (table.__vcSort) return;
      table.__vcSort = true;
      $all('thead th', table).forEach(function (th, index) {
        var btn = th.querySelector('.vc-table__sort');
        if (!btn) return;
        btn.addEventListener('click', function () {
          var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
          $all('thead th', table).forEach(function (other) { if (other !== th) other.removeAttribute('aria-sort'); });
          th.setAttribute('aria-sort', dir);
          var body = table.tBodies[0];
          var rows = Array.prototype.slice.call(body.rows);
          rows.sort(function (a, b) {
            var x = cellValue(a, index);
            var y = cellValue(b, index);
            var cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
            return dir === 'ascending' ? cmp : -cmp;
          });
          rows.forEach(function (r) { body.appendChild(r); });
        });
      });
    });
  }

  /* ------------------------------------------------------ table selection */
  // <table data-vc-select="#toolbar">: a header checkbox selects all rows (and shows "mixed"),
  // the toolbar appears while rows are selected and its [data-vc-count] shows how many.
  function initTableSelection(scope) {
    $all('table[data-vc-select]', scope).forEach(function (table) {
      if (table.__vcSelect) return;
      table.__vcSelect = true;
      var all = table.querySelector('thead input[type="checkbox"]');
      var bar = null;
      try { bar = document.querySelector(table.getAttribute('data-vc-select')); } catch (e) { bar = null; }
      // The toolbar is hidden while nothing is selected, so the announcement lives in its own
      // polite region next to the table, which exists from the start.
      var status = document.createElement('span');
      status.className = 'vc-visually-hidden';
      status.setAttribute('aria-live', 'polite');
      (table.closest('.vc-table-wrap') || table).insertAdjacentElement('afterend', status);
      function boxes() { return $all('tbody input[type="checkbox"]', table); }
      function sync(announce) {
        var list = boxes();
        var n = list.filter(function (b) { return b.checked; }).length;
        if (all) {
          all.checked = n > 0 && n === list.length;
          all.indeterminate = n > 0 && n < list.length;
        }
        if (bar) {
          bar.hidden = n === 0;
          $all('[data-vc-count]', bar).forEach(function (c) { c.textContent = String(n); });
        }
        if (announce) {
          // wording is configurable for other languages: data-vc-select-status="{n} von {total} ausgewählt"
          var none = table.getAttribute('data-vc-select-none') || 'No rows selected';
          var some = table.getAttribute('data-vc-select-status') || '{n} of {total} selected';
          status.textContent = n === 0 ? none : some.replace('{n}', n).replace('{total}', list.length);
        }
      }
      table.addEventListener('change', function (e) {
        if (all && e.target === all) boxes().forEach(function (b) { if (!b.disabled) b.checked = all.checked; });
        sync(true);
      });
      sync(false);
    });
  }

  /* ---------------------------------------------------------------- misc */
  function initIndeterminate(scope) {
    $all('input[type="checkbox"][data-vc-indeterminate]', scope).forEach(function (cb) { cb.indeterminate = true; });
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  /**
   * Vici.copy(text, button?) copies text and resolves to true or false. A given button gets
   * data-vc-copied for two seconds and fires a `vc:copy` event ({ text, ok }) when done.
   */
  function copyText(text, button) {
    var value = text == null ? '' : String(text);
    function done(ok) {
      if (button) {
        var original = button.getAttribute('data-vc-label') || button.getAttribute('aria-label') || '';
        button.setAttribute('data-vc-copied', ok ? 'true' : 'false');
        if (original) button.setAttribute('aria-label', ok ? 'Copied' : 'Copy failed');
        window.setTimeout(function () {
          button.removeAttribute('data-vc-copied');
          if (original) button.setAttribute('aria-label', original);
        }, 1600);
        button.dispatchEvent(new CustomEvent('vc:copy', { bubbles: true, detail: { text: value, ok: ok } }));
      }
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () { return done(true); }, function () { return done(legacyCopy(value)); });
    }
    return Promise.resolve(done(legacyCopy(value)));
  }

  function init(scope) {
    initTabs(scope);
    initSliders(scope);
    initPopovers(scope);
    initTooltips(scope);
    initCarousels(scope);
    initTables(scope);
    initTableSelection(scope);
    initIndeterminate(scope);
    initScrollRegions(scope);
    syncThemeControls();
  }

  // After a dismissible element is removed, focus goes to its neighbour, not to <body>.
  function focusAfterRemoval(el) {
    function first(node) { return node.matches(FOCUSABLE) ? node : node.querySelector(FOCUSABLE); }
    for (var n = el.nextElementSibling; n; n = n.nextElementSibling) { var a = first(n); if (a) return a; }
    for (var p = el.previousElementSibling; p; p = p.previousElementSibling) { var b = first(p); if (b) return b; }
    var parent = el.parentElement;
    if (!parent || parent === document.body) return null;
    if (!parent.hasAttribute('tabindex')) parent.setAttribute('tabindex', '-1');
    return parent;
  }

  // A click on the backdrop closes a dialog, but only when the press started there too, so
  // selecting text inside the dialog and releasing outside doesn't close it.
  function onBackdrop(e) {
    var t = e.target;
    if (!(t instanceof Element) || t.tagName !== 'DIALOG' || !t.classList.contains('vc-dialog')) return false;
    var r = t.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }
  var backdropPress = null;
  document.addEventListener('pointerdown', function (e) { backdropPress = onBackdrop(e) ? e.target : null; }, true);

  /* --------------------------------------------------- delegated events */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var themeToggle = t.closest('[data-vc-theme-toggle]');
    if (themeToggle) { setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'); return; }
    var themeSet = t.closest('[data-vc-theme-set]');
    if (themeSet) { setTheme(themeSet.getAttribute('data-vc-theme-set')); return; }

    var opener = t.closest('[data-vc-open]');
    if (opener) {
      var dlg = document.getElementById(opener.getAttribute('data-vc-open'));
      if (dlg && typeof dlg.showModal === 'function') { e.preventDefault(); dlg.showModal(); }
      return;
    }
    var closer = t.closest('[data-vc-close]');
    if (closer) {
      var d = closer.closest('dialog');
      if (d) { e.preventDefault(); d.close(closer.getAttribute('data-vc-close') || ''); }
      return;
    }
    if (t.tagName === 'DIALOG') {
      if (t.classList.contains('vc-dialog') && t.getAttribute('data-vc-dismissable') !== 'false' && backdropPress === t && onBackdrop(e)) {
        t.close('backdrop');
      }
      backdropPress = null;
      return;
    }

    var dismiss = t.closest('[data-vc-dismiss]');
    if (dismiss) {
      var target = dismiss.closest(dismiss.getAttribute('data-vc-dismiss') || '.vc-alert, .vc-tag, .vc-toast');
      if (target && target.classList.contains('vc-toast')) dismissToast(target);
      else if (target) {
        var next = target.contains(document.activeElement) || target.contains(dismiss) ? focusAfterRemoval(target) : null;
        target.remove();
        if (next) next.focus();
      }
      return;
    }

    // data-vc-copy="#id" copies the text of that element; any other value is copied as it is
    // (so colour values such as "#250010" work too).
    var copyBtn = t.closest('[data-vc-copy]');
    if (copyBtn) {
      var src = copyBtn.getAttribute('data-vc-copy') || '';
      var node = src.charAt(0) === '#' ? document.getElementById(src.slice(1)) : null;
      copyText(node ? node.textContent : src, copyBtn);
      return;
    }

    var headerToggle = t.closest('.vc-header__toggle');
    if (headerToggle) {
      var header = headerToggle.closest('.vc-header');
      var open = !header.hasAttribute('data-open');
      header.toggleAttribute('data-open', open);
      headerToggle.setAttribute('aria-expanded', String(open));
      return;
    }

    var pressable = t.closest('.vc-chip[aria-pressed], .vc-button--toggle[aria-pressed]');
    if (pressable && !pressable.disabled) {
      pressable.setAttribute('aria-pressed', String(pressable.getAttribute('aria-pressed') !== 'true'));
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target instanceof HTMLInputElement && e.target.classList.contains('vc-slider')) updateSlider(e.target);
  });

  // Tooltips stay dismissible with Escape (WCAG 1.4.13).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    $all('.vc-tooltip-anchor:hover, .vc-tooltip-anchor:focus-within').forEach(function (a) {
      a.setAttribute('data-dismissed', '');
    });
    // a pointer resting on a top-layer tooltip doesn't count as hovering its anchor
    openTips.slice().forEach(function (pair) {
      pair[1].setAttribute('data-dismissed', '');
      if (pair[0].__vcHide) pair[0].__vcHide();
    });
    $all('.vc-header[data-open]').forEach(function (h) {
      h.removeAttribute('data-open');
      var btn = h.querySelector('.vc-header__toggle');
      if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    });
  });
  function clearDismissed(e) {
    var a = e.target instanceof Element ? e.target.closest('.vc-tooltip-anchor[data-dismissed]') : null;
    if (a) a.removeAttribute('data-dismissed');
  }
  document.addEventListener('mouseout', clearDismissed);
  document.addEventListener('focusout', clearDismissed);

  window.Vici = {
    version: '1.0.0',
    init: init,
    toast: toast,
    theme: { get: resolvedTheme, set: setTheme },
    copy: copyText,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(document); });
  else init(document);
})();
