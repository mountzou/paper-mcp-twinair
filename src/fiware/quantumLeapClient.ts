import { config } from "../config.js";
import { fiwareHeaders } from "./headers.js";

export async function quantumLeapGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, config.quantumLeapUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url, { headers: fiwareHeaders("quantumleap") });

  if (!res.ok) {
    throw new Error(`QuantumLeap request failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}