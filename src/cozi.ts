/**
 * familyorg core: the full documented 15-tool surface of the
 * unofficial Cozi Family Organizer client, implemented clean-room
 * against the Cozi REST API base https://rest.cozi.com (overridable
 * via COZI_API_URL).
 *
 * Auth follows the Cozi web API pattern: COZI_USERNAME and
 * COZI_PASSWORD are exchanged at a login endpoint for a token, and
 * that token is then sent as `Authorization: Bearer <token>`. A
 * missing variable is an honest error naming that variable. The
 * `today` tool is a pure local clock and needs no credentials.
 *
 * Request/response shaping against rest.cozi.com is a documented
 * reconstruction from the public tool spec: the exact wire paths
 * below were not verified against a live Cozi account. All HTTP goes
 * through an injected FetchFn so the behaviour is testable offline
 * with a fake fetch, and no live Cozi call is made by the tests.
 *
 * COZI_READ_ONLY=true hides the write tools: READ_ONLY_ENV is read by
 * the MCP layer, which filters tools/list and refuses write calls.
 */
import type {
  AddItemOptions,
  CoziCredentials,
  CreateAppointmentOptions,
  CreateListOptions,
  DeleteAppointmentOptions,
  DeleteListOptions,
  FetchFn,
  GetCalendarOptions,
  GetListItemsOptions,
  GetListsOptions,
  RemoveItemsOptions,
  RenameListOptions,
  SearchCalendarOptions,
  UpdateAppointmentOptions,
  UpdateItemOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_API_BASE = "https://rest.cozi.com";

/** Tools that only read. Everything else in the surface is a write. */
export const READ_TOOL_NAMES = [
  "family_members",
  "get_lists",
  "get_list_items",
  "today",
  "get_calendar",
  "search_calendar",
] as const;

/** Tools hidden when COZI_READ_ONLY=true. */
export const WRITE_TOOL_NAMES = [
  "create_list",
  "rename_list",
  "delete_list",
  "add_item",
  "update_item",
  "remove_items",
  "create_appointment",
  "update_appointment",
  "delete_appointment",
] as const;

export function readOnlyFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.COZI_READ_ONLY;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

export function credentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): CoziCredentials {
  const usernameRaw = env.COZI_USERNAME;
  const username = typeof usernameRaw === "string" ? usernameRaw.trim() : "";
  if (!username) {
    throw new Error("COZI_USERNAME environment variable is required");
  }
  const passwordRaw = env.COZI_PASSWORD;
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  if (!password) {
    throw new Error("COZI_PASSWORD environment variable is required");
  }
  return { username, password };
}

export function baseFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.COZI_API_URL;
  const base = typeof raw === "string" ? raw.trim() : "";
  return (base || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export const apiBaseFromEnv = baseFromEnv;

const enc = encodeURIComponent;

function query(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      parts.push(`${enc(key)}=${enc(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function parseBody(res: {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.message === "string") detail = parsed.message;
      else if (typeof parsed.error === "string") detail = parsed.error;
    } catch {
      // Keep the raw body as the detail.
    }
    throw new Error(`Cozi API error ${res.status}: ${detail}`);
  }
  if (!text) return { status: res.status };
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Exchange the username/password pair for an access token, following
 * the Cozi web API login pattern. Reconstruction: POSTs a JSON body
 * {username, password} to {base}/auth/login and reads the token from
 * a `token`, `access_token`, or `auth_token` field of the reply.
 */
export async function login(
  fetchFn: FetchFn,
  base: string,
  creds: CoziCredentials,
): Promise<string> {
  const res = await fetchFn(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
  });
  const data = (await parseBody(res)) as Record<string, unknown>;
  const token =
    (typeof data?.token === "string" && data.token) ||
    (typeof data?.access_token === "string" && data.access_token) ||
    (typeof data?.auth_token === "string" && data.auth_token) ||
    "";
  if (!token) {
    throw new Error("Cozi login did not return a token");
  }
  return token;
}

interface RequestSpec {
  method: string;
  url: string;
  body?: unknown;
}

async function apiRequest(
  fetchFn: FetchFn,
  token: string,
  spec: RequestSpec,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (spec.body !== undefined) {
    body = JSON.stringify(spec.body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetchFn(spec.url, { method: spec.method, headers, body });
  return parseBody(res);
}

function appointmentBody(
  opts: CreateAppointmentOptions | UpdateAppointmentOptions,
  partial: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  // For creates the caller guarantees the required fields are present;
  // for updates only the provided fields are sent.
  if (!partial) {
    body.subject = (opts as CreateAppointmentOptions).subject;
    body.start = (opts as CreateAppointmentOptions).start;
    body.end = (opts as CreateAppointmentOptions).end;
  } else {
    const u = opts as UpdateAppointmentOptions;
    if (u.subject !== undefined) body.subject = u.subject;
    if (u.start !== undefined) body.start = u.start;
    if (u.end !== undefined) body.end = u.end;
    if (u.scope !== undefined) body.scope = u.scope;
    if (u.occurrence_day !== undefined) body.occurrence_day = u.occurrence_day;
  }
  if (opts.attendees !== undefined) body.attendees = opts.attendees;
  if (opts.all_day !== undefined) body.all_day = opts.all_day;
  if (opts.notes !== undefined) body.notes = opts.notes;
  if (opts.location !== undefined) body.location = opts.location;
  if (opts.repeat !== undefined) body.repeat = opts.repeat;
  if (opts.reminders !== undefined) body.reminders = opts.reminders;
  if (opts.notify !== undefined) body.notify = opts.notify;
  return body;
}

export async function familyMembers(
  fetchFn: FetchFn, token: string, base: string,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/family/members`,
  });
}

export async function getLists(
  fetchFn: FetchFn, token: string, base: string, opts: GetListsOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/lists${query({ type: opts.list_type })}`,
  });
}

export async function getListItems(
  fetchFn: FetchFn, token: string, base: string, opts: GetListItemsOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/lists/${enc(opts.list_id)}/items${query({
      include_completed: opts.include_completed,
    })}`,
  });
}

export async function createList(
  fetchFn: FetchFn, token: string, base: string, opts: CreateListOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/lists`,
    body: { name: opts.name, list_type: opts.list_type },
  });
}

export async function renameList(
  fetchFn: FetchFn, token: string, base: string, opts: RenameListOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "PATCH",
    url: `${base}/lists/${enc(opts.list_id)}`,
    body: { title: opts.title },
  });
}

export async function deleteList(
  fetchFn: FetchFn, token: string, base: string, opts: DeleteListOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "DELETE",
    url: `${base}/lists/${enc(opts.list_id)}`,
  });
}

export async function addItem(
  fetchFn: FetchFn, token: string, base: string, opts: AddItemOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = { text: opts.text };
  if (opts.position !== undefined) body.position = opts.position;
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/lists/${enc(opts.list_id)}/items`,
    body,
  });
}

export async function updateItem(
  fetchFn: FetchFn, token: string, base: string, opts: UpdateItemOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (opts.text !== undefined) body.text = opts.text;
  if (opts.completed !== undefined) body.completed = opts.completed;
  return apiRequest(fetchFn, token, {
    method: "PATCH",
    url: `${base}/lists/${enc(opts.list_id)}/items/${enc(opts.item_id)}`,
    body,
  });
}

export async function removeItems(
  fetchFn: FetchFn, token: string, base: string, opts: RemoveItemsOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/lists/${enc(opts.list_id)}/items/remove`,
    body: { item_ids: opts.item_ids },
  });
}

/** Pure local clock: no credentials, no network. */
export function today(now: Date = new Date()): Record<string, unknown> {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekdays = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    weekday: weekdays[now.getDay()],
    iso: now.toISOString(),
  };
}

export async function getCalendar(
  fetchFn: FetchFn, token: string, base: string, opts: GetCalendarOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/calendar/${opts.year}/${opts.month}`,
  });
}

export async function searchCalendar(
  fetchFn: FetchFn, token: string, base: string, opts: SearchCalendarOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/calendar/search${query({ q: opts.query })}`,
  });
}

export async function createAppointment(
  fetchFn: FetchFn, token: string, base: string, opts: CreateAppointmentOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/calendar/appointments`,
    body: appointmentBody(opts, false),
  });
}

export async function updateAppointment(
  fetchFn: FetchFn, token: string, base: string, opts: UpdateAppointmentOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "PATCH",
    url: `${base}/calendar/appointments/${enc(opts.appointment_id)}${query({
      year: opts.year,
      month: opts.month,
    })}`,
    body: appointmentBody(opts, true),
  });
}

export async function deleteAppointment(
  fetchFn: FetchFn, token: string, base: string, opts: DeleteAppointmentOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "DELETE",
    url: `${base}/calendar/appointments/${enc(opts.appointment_id)}${query({
      year: opts.year,
      month: opts.month,
      scope: opts.scope,
      occurrence_day: opts.occurrence_day,
      notify: opts.notify,
    })}`,
  });
}

/**
 * Dispatch a tool call by name, performing the login exchange first
 * for every tool except `today`. Used by the MCP server and the CLI.
 */
export async function callTool(
  fetchFn: FetchFn,
  creds: CoziCredentials | null,
  base: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "today") return today();
  if (!creds) {
    throw new Error("COZI_USERNAME environment variable is required");
  }
  const token = await login(fetchFn, base, creds);
  switch (name) {
    case "family_members":
      return familyMembers(fetchFn, token, base);
    case "get_lists":
      return getLists(fetchFn, token, base, args as unknown as GetListsOptions);
    case "get_list_items":
      return getListItems(fetchFn, token, base, args as unknown as GetListItemsOptions);
    case "create_list":
      return createList(fetchFn, token, base, args as unknown as CreateListOptions);
    case "rename_list":
      return renameList(fetchFn, token, base, args as unknown as RenameListOptions);
    case "delete_list":
      return deleteList(fetchFn, token, base, args as unknown as DeleteListOptions);
    case "add_item":
      return addItem(fetchFn, token, base, args as unknown as AddItemOptions);
    case "update_item":
      return updateItem(fetchFn, token, base, args as unknown as UpdateItemOptions);
    case "remove_items":
      return removeItems(fetchFn, token, base, args as unknown as RemoveItemsOptions);
    case "get_calendar":
      return getCalendar(fetchFn, token, base, args as unknown as GetCalendarOptions);
    case "search_calendar":
      return searchCalendar(fetchFn, token, base, args as unknown as SearchCalendarOptions);
    case "create_appointment":
      return createAppointment(fetchFn, token, base, args as unknown as CreateAppointmentOptions);
    case "update_appointment":
      return updateAppointment(fetchFn, token, base, args as unknown as UpdateAppointmentOptions);
    case "delete_appointment":
      return deleteAppointment(fetchFn, token, base, args as unknown as DeleteAppointmentOptions);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
