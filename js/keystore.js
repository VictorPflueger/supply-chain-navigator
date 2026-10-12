// Session-only storage for the user's Anthropic API key.
// The key lives in sessionStorage (cleared when the tab closes), is shown masked, is never logged
// or exported, and is only ever attached to requests to api.anthropic.com (see anthropic.js).

import { STORAGE } from "./config.js";

const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
let memoryFallback = null;

export function getKey() {
  try {
    return sessionStorage.getItem(STORAGE.apiKey) || memoryFallback;
  } catch {
    return memoryFallback;
  }
}

export function hasKey() {
  return !!getKey();
}

export function setKey(raw) {
  const key = String(raw || "").trim();
  try {
    sessionStorage.setItem(STORAGE.apiKey, key);
    memoryFallback = null;
  } catch {
    memoryFallback = key; // private mode without storage: keep for this page only
  }
  return key;
}

export function forgetKey() {
  try { sessionStorage.removeItem(STORAGE.apiKey); } catch { /* ignore */ }
  memoryFallback = null;
}

/** Format check only; the real check is a free GET /v1/models call. */
export function looksLikeKey(raw) {
  return KEY_PATTERN.test(String(raw || "").trim());
}

/** Masked representation for display, e.g. "sk-ant-…9fQx". */
export function maskKey(key = getKey()) {
  if (!key) return "";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

/** Removes anything that looks like an Anthropic key from a string (defence in depth for logs/exports). */
export function redactSecrets(text) {
  return String(text).replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "sk-ant-[REDACTED]");
}
