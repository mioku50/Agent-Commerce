export type JsonSchema = Record<string, unknown>;

export type JsonSchemaValidationResult =
  | { ok: true }
  | { ok: false; path: string; message: string };

const SUPPORTED_TYPES = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

const SUPPORTED_KEYWORDS = new Set([
  "type",
  "title",
  "description",
  "default",
  "examples",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
]);

function fail(path: string, message: string): JsonSchemaValidationResult {
  return { ok: false, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateSchemaNode(schema: unknown, path: string, depth: number): JsonSchemaValidationResult {
  if (!isRecord(schema)) return fail(path, "schema must be a JSON object");
  if (depth > 12) return fail(path, "schema nesting exceeds 12 levels");

  const unsupported = Object.keys(schema).find((key) => !SUPPORTED_KEYWORDS.has(key));
  if (unsupported) return fail(`${path}.${unsupported}`, "keyword is not supported");

  const type = schema.type;
  if (typeof type !== "string" || !SUPPORTED_TYPES.has(type)) {
    return fail(`${path}.type`, "a supported JSON Schema type is required");
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.length > 100)) {
    return fail(`${path}.enum`, "enum must contain 1-100 JSON values");
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string"))) {
    return fail(`${path}.required`, "required must be an array of property names");
  }
  if (Array.isArray(schema.required) && new Set(schema.required).size !== schema.required.length) {
    return fail(`${path}.required`, "required property names must be unique");
  }
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) return fail(`${path}.properties`, "properties must be an object");
    if (Object.keys(schema.properties).length > 100) return fail(`${path}.properties`, "at most 100 properties are supported");
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!key || key.length > 100) return fail(`${path}.properties`, "property names must contain 1-100 characters");
      const result = validateSchemaNode(child, `${path}.properties.${key}`, depth + 1);
      if (!result.ok) return result;
    }
  }
  if (schema.items !== undefined) {
    const result = validateSchemaNode(schema.items, `${path}.items`, depth + 1);
    if (!result.ok) return result;
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    return fail(`${path}.additionalProperties`, "only boolean additionalProperties is supported");
  }
  for (const keyword of ["minimum", "maximum"] as const) {
    if (schema[keyword] !== undefined && (typeof schema[keyword] !== "number" || !Number.isFinite(schema[keyword]))) {
      return fail(`${path}.${keyword}`, `${keyword} must be a finite number`);
    }
  }
  for (const keyword of ["minLength", "maxLength", "minItems", "maxItems"] as const) {
    if (schema[keyword] !== undefined && (!Number.isInteger(schema[keyword]) || Number(schema[keyword]) < 0)) {
      return fail(`${path}.${keyword}`, `${keyword} must be a non-negative integer`);
    }
  }
  if (typeof schema.minLength === "number" && typeof schema.maxLength === "number" && schema.minLength > schema.maxLength) {
    return fail(path, "minLength cannot exceed maxLength");
  }
  if (typeof schema.minItems === "number" && typeof schema.maxItems === "number" && schema.minItems > schema.maxItems) {
    return fail(path, "minItems cannot exceed maxItems");
  }
  if (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum) {
    return fail(path, "minimum cannot exceed maximum");
  }
  return { ok: true };
}

export function validateSupportedJsonSchema(schema: unknown): JsonSchemaValidationResult {
  return validateSchemaNode(schema, "$schema", 0);
}

function matchesType(value: unknown, type: string) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validateValueNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  depth: number,
): JsonSchemaValidationResult {
  if (depth > 20) return fail(path, "value nesting exceeds 20 levels");
  const type = schema.type as string;
  if (!matchesType(value, type)) return fail(path, `expected ${type}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => jsonEqual(candidate, value))) {
    return fail(path, "value is not in the allowed enum");
  }
  if (schema.const !== undefined && !jsonEqual(schema.const, value)) {
    return fail(path, "value does not match const");
  }

  if (type === "object") {
    const record = value as Record<string, unknown>;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required as string[] : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        return fail(`${path}.${key}`, "required property is missing");
      }
    }
    if (schema.additionalProperties === false) {
      const unknownKey = Object.keys(record).find((key) => !(key in properties));
      if (unknownKey) return fail(`${path}.${unknownKey}`, "additional property is not allowed");
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      const result = validateValueNode(record[key], childSchema as JsonSchema, `${path}.${key}`, depth + 1);
      if (!result.ok) return result;
    }
  }

  if (type === "array") {
    const list = value as unknown[];
    if (typeof schema.minItems === "number" && list.length < schema.minItems) return fail(path, "array is too short");
    if (typeof schema.maxItems === "number" && list.length > schema.maxItems) return fail(path, "array is too long");
    if (isRecord(schema.items)) {
      for (let index = 0; index < list.length; index += 1) {
        const result = validateValueNode(list[index], schema.items, `${path}[${index}]`, depth + 1);
        if (!result.ok) return result;
      }
    }
  }

  if (type === "string") {
    const text = value as string;
    if (typeof schema.minLength === "number" && text.length < schema.minLength) return fail(path, "string is too short");
    if (typeof schema.maxLength === "number" && text.length > schema.maxLength) return fail(path, "string is too long");
  }

  if (type === "number" || type === "integer") {
    const number = value as number;
    if (typeof schema.minimum === "number" && number < schema.minimum) return fail(path, "number is below minimum");
    if (typeof schema.maximum === "number" && number > schema.maximum) return fail(path, "number is above maximum");
  }

  return { ok: true };
}

export function validateJsonSchemaValue(
  value: unknown,
  schema: JsonSchema,
): JsonSchemaValidationResult {
  const schemaResult = validateSupportedJsonSchema(schema);
  if (!schemaResult.ok) return schemaResult;
  return validateValueNode(value, schema, "$", 0);
}
