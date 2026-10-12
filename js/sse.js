// Minimal Server-Sent Events reader for fetch() bodies. Yields { event, data } records as they
// arrive and tolerates \r\n line endings split across network chunks.

/**
 * @param {ReadableStream<Uint8Array>} body
 * @param {(record: {event: string, data: string}) => void} onRecord
 * @param {{ idleMs?: number, onIdle?: () => void }} opts  calls onIdle when no bytes arrive for idleMs
 */
export async function readSse(body, onRecord, { idleMs = 0, onIdle } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let idleTimer = null;
  const armIdle = () => {
    if (!idleMs || !onIdle) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdle, idleMs);
  };
  armIdle();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      armIdle();
      buf += decoder.decode(value, { stream: true });
      // Keep a trailing CR until we know whether an LF follows it in the next chunk.
      let hold = "";
      if (buf.endsWith("\r")) { hold = "\r"; buf = buf.slice(0, -1); }
      buf = buf.replace(/\r\n?/g, "\n");
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const rec = parseRecord(raw);
        if (rec) onRecord(rec);
      }
      buf += hold;
    }
    buf += decoder.decode();
    const rest = parseRecord(buf.replace(/\r\n?/g, "\n").trim());
    if (rest) onRecord(rest);
  } finally {
    clearTimeout(idleTimer);
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

function parseRecord(raw) {
  if (!raw) return null;
  let event = "message";
  const data = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const c = line.indexOf(":");
    const field = c < 0 ? line : line.slice(0, c);
    let value = c < 0 ? "" : line.slice(c + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
