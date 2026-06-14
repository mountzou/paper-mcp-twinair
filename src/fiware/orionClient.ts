import { config } from "../config.js";
import { fiwareHeaders } from "./headers.js";

export async function orionGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, config.orionUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url, { headers: fiwareHeaders("orion") });

  if (!res.ok) {
    throw new Error(`Orion request failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}