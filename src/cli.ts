#!/usr/bin/env node
/**
 * familyorg CLI.
 *   familyorg <tool-name> '<json args>'
 *   familyorg mcp
 * Requires COZI_USERNAME and COZI_PASSWORD for every tool except
 * `today`. Exit codes: 0 success, 1 error, 2 usage.
 */
import {
  baseFromEnv,
  callTool,
  credentialsFromEnv,
  readOnlyFromEnv,
  VERSION,
  WRITE_TOOL_NAMES,
} from "./cozi.js";
import type { CoziCredentials, FetchFn } from "./types.js";

const TOOL_NAMES = [
  "family_members", "get_lists", "get_list_items", "create_list",
  "rename_list", "delete_list", "add_item", "update_item",
  "remove_items", "today", "get_calendar", "search_calendar",
  "create_appointment", "update_appointment", "delete_appointment",
];

function usage(): never {
  console.error(`Usage:
  familyorg <tool> '<json args>'   tools: ${TOOL_NAMES.join(", ")}
  familyorg mcp
  familyorg --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd || !TOOL_NAMES.includes(cmd)) usage();
  if (
    readOnlyFromEnv() &&
    (WRITE_TOOL_NAMES as unknown as string[]).includes(cmd)
  ) {
    console.error(`error: Tool ${cmd} is unavailable: COZI_READ_ONLY is true`);
    process.exit(1);
  }
  let args: Record<string, unknown> = {};
  const raw = rest.join(" ").trim();
  if (raw) {
    try {
      args = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error("error: args must be a JSON object");
      process.exit(1);
    }
  }
  try {
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    let creds: CoziCredentials | null = null;
    if (cmd !== "today") creds = credentialsFromEnv();
    const out = await callTool(fetchFn, creds, baseFromEnv(), cmd, args);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
