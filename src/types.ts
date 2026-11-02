/**
 * familyorg types.
 *
 * The documented cozi_mcp surface: family members, shopping and to-do
 * lists with their items, and the shared calendar with appointments
 * and search, against the Cozi REST API. HTTP access is described by
 * a minimal response surface so tests can inject a fake fetch.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;

export interface CoziCredentials {
  username: string;
  password: string;
}

export type ListType = "shopping" | "todo";

/** Recurrence rule for an appointment, kept generic on purpose. */
export type RepeatRule = Record<string, unknown>;

export interface FamilyMembersOptions {
  [key: string]: never;
}

export interface GetListsOptions {
  list_type?: ListType;
}

export interface GetListItemsOptions {
  list_id: string;
  include_completed?: boolean;
}

export interface CreateListOptions {
  name: string;
  list_type: ListType;
}

export interface RenameListOptions {
  list_id: string;
  title: string;
}

export interface DeleteListOptions {
  list_id: string;
}

export interface AddItemOptions {
  list_id: string;
  text: string;
  position?: number;
}

export interface UpdateItemOptions {
  list_id: string;
  item_id: string;
  text?: string;
  completed?: boolean;
}

export interface RemoveItemsOptions {
  list_id: string;
  item_ids: string[];
}

export interface TodayOptions {
  [key: string]: never;
}

export interface GetCalendarOptions {
  year: number;
  month: number;
}

export interface SearchCalendarOptions {
  query: string;
}

export interface CreateAppointmentOptions {
  subject: string;
  start: string;
  end: string;
  attendees?: string[];
  all_day?: boolean;
  notes?: string;
  location?: string;
  repeat?: RepeatRule;
  reminders?: unknown[];
  notify?: boolean;
}

export interface UpdateAppointmentOptions {
  appointment_id: string;
  year: number;
  month: number;
  subject?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  all_day?: boolean;
  notes?: string;
  location?: string;
  repeat?: RepeatRule;
  reminders?: unknown[];
  notify?: boolean;
  scope?: string;
  occurrence_day?: string;
}

export interface DeleteAppointmentOptions {
  appointment_id: string;
  year: number;
  month: number;
  scope?: string;
  occurrence_day?: string;
  notify?: boolean;
}
