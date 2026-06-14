import { config } from "../config.js";

export function fiwareHeaders(mode: "orion" | "quantumleap" = "orion"): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Link": `<${config.contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"`
  };

  if (config.authToken) {
    headers["X-Auth-Token"] = config.authToken;
  }

  if (mode === "orion") {
    if (config.ngsildTenant) headers["NGSILD-Tenant"] = config.ngsildTenant;
    else if (config.fiwareService) headers["Fiware-Service"] = config.fiwareService;
  }

  if (mode === "quantumleap" && config.fiwareService) {
    headers["Fiware-Service"] = config.fiwareService;
  }

  return headers;
}