/**
 * The MCP endpoint's tools as a list: what `tools/list` describes and what
 * `tools/call` runs. A tool's definition and what it does sit together, in
 * `mcp-read-tools.ts` and `mcp-write-tools.ts`. This file checks a call's
 * arguments against the tool's schema and turns the outcome into a result.
 * A mistake the caller can fix (an unknown card, a bad argument) is a result
 * with `isError` set. Nothing here knows JSON-RPC or HTTP.
 */
import { NotFoundError, type Boards } from './boards.js';
import type { Looseleaf } from './looseleaf.js';
import { READ_TOOLS } from './mcp-read-tools.js';
import { WRITE_TOOLS } from './mcp-write-tools.js';

/** What a tool works with: the boards, the address cards are reached at, and Looseleaf when the server is connected to one. */
export interface McpContext {
  boards: Boards;
  /** The server's address as the caller reached it, e.g. `http://127.0.0.1:8422`. */
  baseUrl: string;
  looseleaf: Looseleaf | null;
}

interface TextProperty {
  type: 'string';
  description: string;
  enum?: readonly string[];
}

interface ObjectItems {
  type: 'object';
  properties: Record<string, TextProperty>;
  required: readonly string[];
  additionalProperties: false;
}

export type McpProperty =
  | TextProperty
  | { type: 'integer'; description: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description: string }
  | { type: 'array'; description: string; items: { type: 'string' } | ObjectItems };

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, McpProperty>;
    required?: readonly string[];
    additionalProperties: false;
  };
  annotations: { readOnlyHint: boolean };
  /** Does the work and answers with the text to show. Throws NotFoundError for a mistake the caller can fix. */
  run(context: McpContext, args: Record<string, unknown>): Promise<string>;
}

/** What `tools/call` answers: one text block, flagged when the call could not be done. */
export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}

export const MCP_TOOLS: readonly McpTool[] = [...READ_TOOLS, ...WRITE_TOOLS];

/** The tools as `tools/list` sends them. */
export function describeTools(): Array<Omit<McpTool, 'run'>> {
  return MCP_TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }));
}

/** Thrown by `callMcpTool` for a tool name it does not have. */
export class UnknownToolError extends Error {}

/**
 * Runs a tool. `args` is the request's `arguments` as received. Throws
 * UnknownToolError for a name that is not in MCP_TOOLS; any other throw is a
 * server fault.
 */
export async function callMcpTool(context: McpContext, name: string, args: unknown): Promise<McpToolResult> {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new UnknownToolError(`No tool is named "${name}". The tools are ${MCP_TOOLS.map((t) => t.name).join(', ')}.`);
  const checked = checkArguments(tool, args);
  if (typeof checked === 'string') return failure(checked);
  try {
    return { content: [{ type: 'text', text: await tool.run(context, checked) }] };
  } catch (error) {
    if (error instanceof NotFoundError) return failure(error.message);
    throw error;
  }
}

function failure(text: string): McpToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** The arguments when they fit the tool's schema, else a sentence saying what does not. */
function checkArguments(tool: McpTool, args: unknown): Record<string, unknown> | string {
  const given = args === undefined || args === null ? {} : args;
  if (typeof given !== 'object' || Array.isArray(given)) return `${tool.name} takes its arguments as an object.`;
  const values = given as Record<string, unknown>;
  const { properties, required = [] } = tool.inputSchema;
  for (const key of Object.keys(values)) {
    if (!Object.hasOwn(properties, key)) {
      return `${tool.name} has no argument "${key}". Its arguments are: ${Object.keys(properties).join(', ') || 'none'}.`;
    }
  }
  for (const key of required) {
    if (values[key] === undefined || values[key] === null) return `${tool.name} needs "${key}": ${properties[key]!.description}`;
  }
  const checked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    const problem = checkValue(key, value, properties[key]!);
    if (problem !== null) return `${tool.name}: ${problem}`;
    checked[key] = value;
  }
  return checked;
}

function checkValue(key: string, value: unknown, property: McpProperty): string | null {
  switch (property.type) {
    case 'string':
      return checkText(key, value, property);
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) return `"${key}" must be a whole number.`;
      if (property.minimum !== undefined && value < property.minimum) return `"${key}" must be at least ${property.minimum}.`;
      if (property.maximum !== undefined && value > property.maximum) return `"${key}" must be at most ${property.maximum}.`;
      return null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : `"${key}" must be true or false.`;
    case 'array': {
      if (!Array.isArray(value)) return `"${key}" must be a list.`;
      for (const [index, item] of value.entries()) {
        const problem = property.items.type === 'string' ? checkText(`${key}[${index}]`, item, null) : checkItem(`${key}[${index}]`, item, property.items);
        if (problem !== null) return problem;
      }
      return null;
    }
  }
}

function checkText(key: string, value: unknown, property: TextProperty | null): string | null {
  if (typeof value !== 'string') return `"${key}" must be text.`;
  if (property?.enum !== undefined && !property.enum.includes(value)) return `"${key}" must be one of: ${property.enum.join(', ')}.`;
  return null;
}

function checkItem(key: string, value: unknown, items: ObjectItems): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return `"${key}" must be an object.`;
  const fields = value as Record<string, unknown>;
  for (const field of Object.keys(fields)) {
    if (!Object.hasOwn(items.properties, field)) return `"${key}" has no field "${field}". Its fields are: ${Object.keys(items.properties).join(', ')}.`;
  }
  for (const field of items.required) {
    if (typeof fields[field] !== 'string') return `"${key}" needs "${field}": ${items.properties[field]!.description}`;
  }
  for (const [field, fieldValue] of Object.entries(fields)) {
    const problem = checkText(`${key}.${field}`, fieldValue, items.properties[field]!);
    if (problem !== null) return problem;
  }
  return null;
}
