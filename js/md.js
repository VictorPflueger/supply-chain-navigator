// Minimal, escape-first Markdown renderer for model-written text (management summary, console).
// Builds DOM nodes with textContent only, so model output can never inject HTML or scripts.
// Supported: # ## ### headings, paragraphs, - / * / 1. lists, > quotes, --- rules, | tables |,
// **bold**, *italic*, ~~strike~~, `code`, [links](https://…) (http/https only).

export function renderMarkdown(src) {
  const root = document.createElement("div");
  root.className = "md";
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1); // # → h2 (h1 is the app title)
      root.appendChild(inlineEl(`h${level}`, heading[2]));
      i++;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      root.appendChild(document.createElement("hr"));
      i++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      root.appendChild(table(rows));
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const q = document.createElement("blockquote");
      const parts = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) parts.push(lines[i++].replace(/^\s*>\s?/, ""));
      q.appendChild(inlineEl("p", parts.join(" ")));
      root.appendChild(q);
      continue;
    }

    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        list.appendChild(inlineEl("li", lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, "")));
        i++;
      }
      root.appendChild(list);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s+|\s*>|\s*\|)/.test(lines[i])) {
      para.push(lines[i++].trim());
    }
    if (para.length) root.appendChild(inlineEl("p", para.join(" ")));
    else i++;
  }
  return root;
}

function table(rows) {
  const t = document.createElement("table");
  const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const head = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const c of cells(rows[0])) tr.appendChild(inlineEl("th", c));
  head.appendChild(tr);
  t.appendChild(head);
  const body = document.createElement("tbody");
  for (const row of rows.slice(2)) {
    const r = document.createElement("tr");
    for (const c of cells(row)) r.appendChild(inlineEl("td", c));
    body.appendChild(r);
  }
  t.appendChild(body);
  const wrap = document.createElement("div");
  wrap.className = "md-table";
  wrap.appendChild(t);
  return wrap;
}

export function inlineEl(tag, text) {
  const el = document.createElement(tag);
  renderInline(text, el);
  return el;
}

const INLINE = /(\*\*([^*]+)\*\*)|(~~([^~]+)~~)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*([^*\s][^*]*)\*)/g;

/** Appends inline-formatted text to `parent`. */
export function renderInline(text, parent) {
  const s = String(text ?? "");
  let last = 0;
  INLINE.lastIndex = 0;
  let m;
  while ((m = INLINE.exec(s))) {
    if (m.index > last) parent.appendChild(textNode(s.slice(last, m.index)));
    if (m[1]) parent.appendChild(wrap("strong", m[2]));
    else if (m[3]) parent.appendChild(wrap("s", m[4]));
    else if (m[5]) {
      const c = document.createElement("code");
      c.textContent = m[6];
      parent.appendChild(c);
    } else if (m[7]) {
      const a = document.createElement("a");
      a.href = m[9];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = m[8];
      parent.appendChild(a);
    } else if (m[10]) parent.appendChild(wrap("em", m[11]));
    last = INLINE.lastIndex;
  }
  if (last < s.length) parent.appendChild(textNode(s.slice(last)));
  return parent;
}

/** Text node with a no-break space before "%", so "55 %" never wraps between number and sign. */
function textNode(text) {
  return document.createTextNode(text.replace(/(\d) %/g, "$1\u00a0%"));
}

function wrap(tag, inner) {
  const el = document.createElement(tag);
  // Nested inline formatting is rendered with a fresh regex pass.
  const saved = INLINE.lastIndex;
  renderInline(inner, el);
  INLINE.lastIndex = saved;
  return el;
}
