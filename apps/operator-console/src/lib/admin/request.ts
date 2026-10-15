export type AdminMutationOperation = "insert" | "update" | "delete";

export interface AdminMutationRequest {
  requestId: string;
  actor: string;
  operation: AdminMutationOperation;
  schema: "public";
  relation: string;
  key?: Record<string, unknown>;
  values?: Record<string, unknown>;
  provenance: Record<string, unknown>;
}

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function optionalObject(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return object(value, label);
}

export function validateAdminMutationRequest(value: unknown): AdminMutationRequest {
  const raw = object(value, "request");
  const requestId = raw.requestId;
  const actor = raw.actor;
  const operation = raw.operation;
  const schema = raw.schema;
  const relation = raw.relation;

  if (typeof requestId !== "string" || !uuidPattern.test(requestId)) {
    throw new Error("requestId must be a UUID");
  }
  if (typeof actor !== "string" || actor.trim().length === 0 || actor.length > 200) {
    throw new Error("actor must be a non-empty string of at most 200 characters");
  }
  if (operation !== "insert" && operation !== "update" && operation !== "delete") {
    throw new Error("operation must be insert, update, or delete");
  }
  if (schema !== "public") {
    throw new Error("OC-002 administrative mutations are restricted to the public schema");
  }
  if (typeof relation !== "string" || !identifierPattern.test(relation)) {
    throw new Error("relation must be a valid PostgreSQL identifier");
  }

  const key = optionalObject(raw.key, "key");
  const values = optionalObject(raw.values, "values");
  const provenance = optionalObject(raw.provenance, "provenance") ?? {};

  if ((operation === "update" || operation === "delete") && (!key || Object.keys(key).length === 0)) {
    throw new Error("update and delete require a primary-key object");
  }
  if ((operation === "insert" || operation === "update") && (!values || Object.keys(values).length === 0)) {
    throw new Error("insert and update require a non-empty values object");
  }

  return {
    requestId,
    actor: actor.trim(),
    operation,
    schema,
    relation,
    ...(key ? { key } : {}),
    ...(values ? { values } : {}),
    provenance,
  };
}
