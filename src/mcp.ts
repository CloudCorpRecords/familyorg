/**
 * familyorg MCP server. Full documented set: 15 tools.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call args. When COZI_READ_ONLY=true,
 * tools/list hides the nine write tools and write calls are refused.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  baseFromEnv,
  callTool,
  credentialsFromEnv,
  readOnlyFromEnv,
  VERSION,
  WRITE_TOOL_NAMES,
} from "./cozi.js";
import type { CoziCredentials, FetchFn } from "./types.js";

const repeatSchema = z.record(z.string(), z.unknown());

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  family_members: z.object({}),
  get_lists: z.object({
    list_type: z.enum(["shopping", "todo"]).optional(),
  }),
  get_list_items: z.object({
    list_id: z.string(),
    include_completed: z.boolean().optional(),
  }),
  create_list: z.object({
    name: z.string(),
    list_type: z.enum(["shopping", "todo"]),
  }),
  rename_list: z.object({ list_id: z.string(), title: z.string() }),
  delete_list: z.object({ list_id: z.string() }),
  add_item: z.object({
    list_id: z.string(),
    text: z.string(),
    position: z.number().int().optional(),
  }),
  update_item: z.object({
    list_id: z.string(),
    item_id: z.string(),
    text: z.string().optional(),
    completed: z.boolean().optional(),
  }),
  remove_items: z.object({
    list_id: z.string(),
    item_ids: z.array(z.string()),
  }),
  today: z.object({}),
  get_calendar: z.object({
    year: z.number().int(),
    month: z.number().int(),
  }),
  search_calendar: z.object({ query: z.string() }),
  create_appointment: z.object({
    subject: z.string(),
    start: z.string(),
    end: z.string(),
    attendees: z.array(z.string()).optional(),
    all_day: z.boolean().optional(),
    notes: z.string().optional(),
    location: z.string().optional(),
    repeat: repeatSchema.optional(),
    reminders: z.array(z.unknown()).optional(),
    notify: z.boolean().optional(),
  }),
  update_appointment: z.object({
    appointment_id: z.string(),
    year: z.number().int(),
    month: z.number().int(),
    subject: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    all_day: z.boolean().optional(),
    notes: z.string().optional(),
    location: z.string().optional(),
    repeat: repeatSchema.optional(),
    reminders: z.array(z.unknown()).optional(),
    notify: z.boolean().optional(),
    scope: z.string().optional(),
    occurrence_day: z.string().optional(),
  }),
  delete_appointment: z.object({
    appointment_id: z.string(),
    year: z.number().int(),
    month: z.number().int(),
    scope: z.string().optional(),
    occurrence_day: z.string().optional(),
    notify: z.boolean().optional(),
  }),
};

export const TOOLS = [
  {
    name: "family_members",
    description: "List the members of the Cozi family account.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_lists",
    description: "List the family's lists, optionally filtered by list type.",
    inputSchema: {
      type: "object" as const,
      properties: {
        list_type: { type: "string", enum: ["shopping", "todo"], description: "Optional list type to filter by: \"shopping\" or \"todo\". All lists are returned when omitted." },
      },
      required: [],
    },
  },
  {
    name: "get_list_items",
    description: "Get the items on one list, optionally including completed items.",
    inputSchema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "ID of the list to get items from, as returned by get_lists." },
        include_completed: { type: "boolean", description: "When true, include completed items in the result." },
      },
      required: ["list_id"],
    },
  },
  {
    name: "create_list",
    description: "Create a new shopping or to-do list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name of the new list." },
        list_type: { type: "string", enum: ["shopping", "todo"], description: "Type of the new list: \"shopping\" or \"todo\"." },
      },
      required: ["name", "list_type"],
    },
  },
  {
    name: "rename_list",
    description: "Rename an existing list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "ID of the list to rename, as returned by get_lists." },
        title: { type: "string", description: "New title for the list." },
      },
      required: ["list_id", "title"],
    },
  },
  {
    name: "delete_list",
    description: "Delete a list from the family account, removing the list identified by list_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "ID of the list to delete, as returned by get_lists." },
      },
      required: ["list_id"],
    },
  },
  {
    name: "add_item",
    description: "Add an item to a list, optionally at a position.",
    inputSchema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "ID of the list to add the item to, as returned by get_lists." },
        text: { type: "string", description: "Text of the item to add." },
        position: { type: "integer", description: "Optional position in the list at which to insert the item." },
      },
      required: ["list_id", "text"],
    },
  },
  {
    name: "update_item",
    description: "Update an item's text or completed state on a list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "ID of the list containing the item, as returned by get_lists." },
        item_id: { type: "string", description: "ID of the item to update, as returned by get_list_items." },
        text: { type: "string", description: "Optional new text for the item." },
        completed: { type: "boolean", description: "Optional new completed state for the item." },
      },
      required: ["list_id", "item_id"],
    },
  },
  {
    name: "remove_items",
    description: "Remove one or more items from a list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        list_id: { type: "string", description: "ID of the list to remove items from, as returned by get_lists." },
        item_ids: { type: "array", items: { type: "string" }, description: "IDs of the items to remove, as returned by get_list_items." },
      },
      required: ["list_id", "item_ids"],
    },
  },
  {
    name: "today",
    description: "Return today's date from the local clock. Needs no Cozi credentials.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_calendar",
    description: "Get the family calendar appointments for one month.",
    inputSchema: {
      type: "object" as const,
      properties: {
        year: { type: "integer", description: "Four-digit year of the month to retrieve." },
        month: { type: "integer", description: "Month to retrieve, as a number from 1 to 12." },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "search_calendar",
    description: "Search the family calendar for appointments matching a query.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search text to match against calendar appointments." },
      },
      required: ["query"],
    },
  },
  {
    name: "create_appointment",
    description: "Create an appointment on the family calendar.",
    inputSchema: {
      type: "object" as const,
      properties: {
        subject: { type: "string", description: "Subject (title) of the appointment." },
        start: { type: "string", description: "Start time of the appointment, as a date/time string." },
        end: { type: "string", description: "End time of the appointment, as a date/time string." },
        attendees: { type: "array", items: { type: "string" }, description: "Optional attendees for the appointment, as a list of names or identifiers." },
        all_day: { type: "boolean", description: "When true, the appointment is an all-day appointment." },
        notes: { type: "string", description: "Optional notes for the appointment." },
        location: { type: "string", description: "Optional location of the appointment." },
        repeat: { type: "object", description: "Optional recurrence rule for the appointment, as an object." },
        reminders: { type: "array", description: "Optional reminders for the appointment, as a list." },
        notify: { type: "boolean", description: "When true, notify attendees about the appointment." },
      },
      required: ["subject", "start", "end"],
    },
  },
  {
    name: "update_appointment",
    description: "Update fields of an existing appointment in a given month.",
    inputSchema: {
      type: "object" as const,
      properties: {
        appointment_id: { type: "string", description: "ID of the appointment to update." },
        year: { type: "integer", description: "Year of the month containing the appointment." },
        month: { type: "integer", description: "Month containing the appointment, as a number from 1 to 12." },
        subject: { type: "string", description: "Optional new subject (title) for the appointment." },
        start: { type: "string", description: "Optional new start time, as a date/time string." },
        end: { type: "string", description: "Optional new end time, as a date/time string." },
        attendees: { type: "array", items: { type: "string" }, description: "Optional new attendees, as a list of names or identifiers." },
        all_day: { type: "boolean", description: "Optional new all-day state for the appointment." },
        notes: { type: "string", description: "Optional new notes for the appointment." },
        location: { type: "string", description: "Optional new location for the appointment." },
        repeat: { type: "object", description: "Optional new recurrence rule, as an object." },
        reminders: { type: "array", description: "Optional new reminders, as a list." },
        notify: { type: "boolean", description: "When true, notify attendees about the update." },
        scope: { type: "string", description: "Optional scope of the update for a repeating appointment, such as a single occurrence or the series." },
        occurrence_day: { type: "string", description: "Optional day of the occurrence to update, for a repeating appointment." },
      },
      required: ["appointment_id", "year", "month"],
    },
  },
  {
    name: "delete_appointment",
    description: "Delete an appointment from a given month.",
    inputSchema: {
      type: "object" as const,
      properties: {
        appointment_id: { type: "string", description: "ID of the appointment to delete." },
        year: { type: "integer", description: "Year of the month containing the appointment." },
        month: { type: "integer", description: "Month containing the appointment, as a number from 1 to 12." },
        scope: { type: "string", description: "Optional scope of the deletion for a repeating appointment, such as a single occurrence or the series." },
        occurrence_day: { type: "string", description: "Optional day of the occurrence to delete, for a repeating appointment." },
        notify: { type: "boolean", description: "When true, notify attendees about the deletion." },
      },
      required: ["appointment_id", "year", "month"],
    },
  },
];

export function visibleTools(readOnly: boolean) {
  if (!readOnly) return TOOLS;
  const writes = new Set<string>(WRITE_TOOL_NAMES as unknown as string[]);
  return TOOLS.filter((t) => !writes.has(t.name));
}

function textResult(value: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: err instanceof Error ? err.message : String(err),
    }],
    isError: true,
  };
}

const readOnly = readOnlyFromEnv();

const server = new Server(
  { name: "familyorg", version: VERSION },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: visibleTools(readOnly),
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  if (readOnly && (WRITE_TOOL_NAMES as unknown as string[]).includes(name)) {
    return errorResult(
      new Error(`Tool ${name} is unavailable: COZI_READ_ONLY is true`),
    );
  }
  try {
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    let creds: CoziCredentials | null = null;
    if (name !== "today") creds = credentialsFromEnv();
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    return textResult(await callTool(fetchFn, creds, baseFromEnv(), name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
