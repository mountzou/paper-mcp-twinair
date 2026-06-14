import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name];
}

export const config = {
  orionUrl: required("ORION_URL"),
  quantumLeapUrl: required("QUANTUMLEAP_URL"),

  fiwareService: optional("FIWARE_SERVICE"),
  ngsildTenant: optional("NGSILD_TENANT"),
  authToken: optional("FIWARE_AUTH_TOKEN"),

  contextUrl: required("FIWARE_CONTEXT")
};