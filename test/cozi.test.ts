import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addItem,
  callTool,
  createAppointment,
  createList,
  credentialsFromEnv,
  deleteAppointment,
  deleteList,
  familyMembers,
  getCalendar,
  getListItems,
  getLists,
  login,
  readOnlyFromEnv,
  removeItems,
  renameList,
  searchCalendar,
  today,
  updateAppointment,
  updateItem,
} from "../src/cozi.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(steps: Array<{ payload?: unknown; status?: number; rawText?: string }>) {
  const calls: Recorded[] = [];
  const queue = [...steps];
  const fn: FetchFn = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body });
    const step = queue.shift() ?? { payload: {} };
    const res: HttpResponse = {
      ok: (step.status ?? 200) < 300,
      status: step.status ?? 200,
      headers: { get: () => null },
      text: async () => step.rawText ?? (step.payload === undefined ? "" : JSON.stringify(step.payload)),
    };
    return res;
  };
  return { fn, calls };
}

const BASE = "https://rest.cozi.com";
const TOKEN = "tok-123";
const CREDS = { username: "parent@example.com", password: "s3cret-test" };

describe("familyorg core", () => {
  it("names COZI_USERNAME when it is missing", () => {
    assert.throws(() => credentialsFromEnv({}), /COZI_USERNAME environment variable is required/);
    assert.throws(
      () => credentialsFromEnv({ COZI_USERNAME: "   ", COZI_PASSWORD: "x" }),
      /COZI_USERNAME/,
    );
  });

  it("names COZI_PASSWORD when only it is missing", () => {
    assert.throws(
      () => credentialsFromEnv({ COZI_USERNAME: "parent@example.com" }),
      /COZI_PASSWORD environment variable is required/,
    );
    assert.deepEqual(
      credentialsFromEnv({ COZI_USERNAME: " parent@example.com ", COZI_PASSWORD: "pw" }),
      { username: "parent@example.com", password: "pw" },
    );
  });

  it("parses COZI_READ_ONLY strictly as the string true", () => {
    assert.equal(readOnlyFromEnv({ COZI_READ_ONLY: "true" }), true);
    assert.equal(readOnlyFromEnv({ COZI_READ_ONLY: " TRUE " }), true);
    assert.equal(readOnlyFromEnv({ COZI_READ_ONLY: "1" }), false);
    assert.equal(readOnlyFromEnv({}), false);
  });

  it("login posts the credentials and extracts the token", async () => {
    const { fn, calls } = fakeFetch([{ payload: { token: TOKEN } }]);
    const token = await login(fn, BASE, CREDS);
    assert.equal(token, TOKEN);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${BASE}/auth/login`);
    assert.deepEqual(calls[0].body, { username: CREDS.username, password: CREDS.password });
  });

  it("login accepts an access_token field and fails honestly without one", async () => {
    const a = fakeFetch([{ payload: { access_token: "tok-alt" } }]);
    assert.equal(await login(a.fn, BASE, CREDS), "tok-alt");
    const b = fakeFetch([{ payload: { ok: true } }]);
    await assert.rejects(() => login(b.fn, BASE, CREDS), /did not return a token/);
  });

  it("family_members gets /family/members with the Bearer token", async () => {
    const { fn, calls } = fakeFetch([{ payload: { members: [{ name: "Sam" }] } }]);
    const out = (await familyMembers(fn, TOKEN, BASE)) as Record<string, unknown>;
    assert.deepEqual(out.members, [{ name: "Sam" }]);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, `${BASE}/family/members`);
    assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  });

  it("get_lists shapes the optional type filter", async () => {
    const a = fakeFetch([{ payload: { lists: [] } }]);
    await getLists(a.fn, TOKEN, BASE, { list_type: "shopping" });
    assert.equal(a.calls[0].url, `${BASE}/lists?type=shopping`);
    const b = fakeFetch([{ payload: { lists: [] } }]);
    await getLists(b.fn, TOKEN, BASE, {});
    assert.equal(b.calls[0].url, `${BASE}/lists`);
  });

  it("get_list_items shapes include_completed only when given", async () => {
    const a = fakeFetch([{ payload: { items: [] } }]);
    await getListItems(a.fn, TOKEN, BASE, { list_id: "L1", include_completed: true });
    assert.equal(a.calls[0].url, `${BASE}/lists/L1/items?include_completed=true`);
    const b = fakeFetch([{ payload: { items: [] } }]);
    await getListItems(b.fn, TOKEN, BASE, { list_id: "L1" });
    assert.equal(b.calls[0].url, `${BASE}/lists/L1/items`);
  });

  it("create_list posts name and list_type", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "L9" } }]);
    await createList(fn, TOKEN, BASE, { name: "Groceries", list_type: "shopping" });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${BASE}/lists`);
    assert.deepEqual(calls[0].body, { name: "Groceries", list_type: "shopping" });
  });

  it("rename_list patches with the new title", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "L1" } }]);
    await renameList(fn, TOKEN, BASE, { list_id: "L1", title: "Weekly shop" });
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].url, `${BASE}/lists/L1`);
    assert.deepEqual(calls[0].body, { title: "Weekly shop" });
  });

  it("delete_list deletes and maps an empty body to {status}", async () => {
    const { fn, calls } = fakeFetch([{ rawText: "" }]);
    const out = await deleteList(fn, TOKEN, BASE, { list_id: "L1" });
    assert.equal(calls[0].method, "DELETE");
    assert.equal(calls[0].url, `${BASE}/lists/L1`);
    assert.deepEqual(out, { status: 200 });
  });

  it("add_item posts text and includes position only when given", async () => {
    const a = fakeFetch([{ payload: { id: "I1" } }]);
    await addItem(a.fn, TOKEN, BASE, { list_id: "L1", text: "Milk", position: 2 });
    assert.equal(a.calls[0].method, "POST");
    assert.equal(a.calls[0].url, `${BASE}/lists/L1/items`);
    assert.deepEqual(a.calls[0].body, { text: "Milk", position: 2 });
    const b = fakeFetch([{ payload: { id: "I2" } }]);
    await addItem(b.fn, TOKEN, BASE, { list_id: "L1", text: "Eggs" });
    assert.deepEqual(b.calls[0].body, { text: "Eggs" });
  });

  it("update_item sends only the provided fields", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "I1" } }]);
    await updateItem(fn, TOKEN, BASE, { list_id: "L1", item_id: "I1", completed: true });
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].url, `${BASE}/lists/L1/items/I1`);
    assert.deepEqual(calls[0].body, { completed: true });
  });

  it("remove_items posts the item id list", async () => {
    const { fn, calls } = fakeFetch([{ payload: { removed: 2 } }]);
    await removeItems(fn, TOKEN, BASE, { list_id: "L1", item_ids: ["I1", "I2"] });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${BASE}/lists/L1/items/remove`);
    assert.deepEqual(calls[0].body, { item_ids: ["I1", "I2"] });
  });

  it("today is a pure local clock with a stable shape", () => {
    const out = today(new Date(2026, 9, 26, 12, 0, 0));
    assert.equal(out.date, "2026-10-26");
    assert.equal(out.year, 2026);
    assert.equal(out.month, 10);
    assert.equal(out.day, 26);
    assert.equal(out.weekday, "Monday");
  });

  it("get_calendar gets /calendar/{year}/{month}", async () => {
    const { fn, calls } = fakeFetch([{ payload: { appointments: [] } }]);
    await getCalendar(fn, TOKEN, BASE, { year: 2026, month: 11 });
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, `${BASE}/calendar/2026/11`);
  });

  it("search_calendar encodes the query", async () => {
    const { fn, calls } = fakeFetch([{ payload: { results: [] } }]);
    await searchCalendar(fn, TOKEN, BASE, { query: "dentist visit" });
    assert.equal(calls[0].url, `${BASE}/calendar/search?q=dentist%20visit`);
  });

  it("create_appointment posts the full body including repeat and reminders", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "A1" } }]);
    const repeat = { frequency: "weekly", interval: 1, weekdays: ["MO"] };
    await createAppointment(fn, TOKEN, BASE, {
      subject: "Soccer practice",
      start: "2026-10-27T16:00:00",
      end: "2026-10-27T17:00:00",
      attendees: ["Sam"],
      location: "Field 2",
      repeat,
      reminders: [{ minutes: 30 }],
      notify: true,
    });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${BASE}/calendar/appointments`);
    const body = calls[0].body as Record<string, unknown>;
    assert.equal(body.subject, "Soccer practice");
    assert.deepEqual(body.repeat, repeat);
    assert.deepEqual(body.reminders, [{ minutes: 30 }]);
    assert.equal(body.notify, true);
  });

  it("update_appointment patches only provided fields, keyed by year/month", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "A1" } }]);
    await updateAppointment(fn, TOKEN, BASE, {
      appointment_id: "A1",
      year: 2026,
      month: 10,
      location: "Field 3",
      scope: "series",
    });
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].url, `${BASE}/calendar/appointments/A1?year=2026&month=10`);
    assert.deepEqual(calls[0].body, { location: "Field 3", scope: "series" });
  });

  it("delete_appointment deletes with the scoping query params", async () => {
    const { fn, calls } = fakeFetch([{ payload: { deleted: true } }]);
    await deleteAppointment(fn, TOKEN, BASE, {
      appointment_id: "A1",
      year: 2026,
      month: 10,
      scope: "this",
      occurrence_day: "2026-10-27",
      notify: false,
    });
    assert.equal(calls[0].method, "DELETE");
    assert.equal(
      calls[0].url,
      `${BASE}/calendar/appointments/A1?year=2026&month=10&scope=this&occurrence_day=2026-10-27&notify=false`,
    );
  });

  it("callTool runs today with no credentials and no fetch", async () => {
    const { fn, calls } = fakeFetch([]);
    const out = (await callTool(fn, null, BASE, "today", {})) as Record<string, unknown>;
    assert.equal(typeof out.date, "string");
    assert.equal(calls.length, 0);
  });

  it("callTool performs the login exchange before the real request", async () => {
    const { fn, calls } = fakeFetch([
      { payload: { token: TOKEN } },
      { payload: { members: [] } },
    ]);
    await callTool(fn, CREDS, BASE, "family_members", {});
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, `${BASE}/auth/login`);
    assert.equal(calls[1].url, `${BASE}/family/members`);
    assert.equal(calls[1].headers.Authorization, `Bearer ${TOKEN}`);
  });

  it("surfaces an upstream error with its status and message", async () => {
    const { fn } = fakeFetch([{ status: 403, payload: { message: "account locked" } }]);
    await assert.rejects(
      () => familyMembers(fn, TOKEN, BASE),
      /Cozi API error 403: account locked/,
    );
  });

  it("rejects an unknown tool name", async () => {
    const { fn } = fakeFetch([{ payload: { token: TOKEN } }]);
    await assert.rejects(
      () => callTool(fn, CREDS, BASE, "not_a_tool", {}),
      /Unknown tool: not_a_tool/,
    );
  });
});
