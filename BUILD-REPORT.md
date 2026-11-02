# familyorg — BUILD REPORT

Original: mjucius/cozi_mcp (rank 118, 6 stars) →
Rebuild: familyorg (@reneturcios/familyorg,
io.github.CloudCorpRecords/familyorg)
FULL documented set. Local only, nothing pushed or published.

## Scope
15 tools for the Cozi Family Organizer REST API
(https://rest.cozi.com, base overridable via COZI_API_URL), all HTTP
behind an injectable FetchFn: family_members, get_lists (optional
list_type shopping|todo), get_list_items, create_list, rename_list,
delete_list, add_item, update_item, remove_items, today,
get_calendar, search_calendar, create_appointment,
update_appointment, delete_appointment.

Auth follows the Cozi web API pattern: COZI_USERNAME +
COZI_PASSWORD are POSTed to {base}/auth/login and the returned
token (token / access_token / auth_token field) is sent as
`Authorization: Bearer <token>` on every later request; callTool
performs the login exchange before the real request. A missing
variable is an honest error naming that variable. `today` is a pure
local clock (date/year/month/day/weekday/iso) and runs with no
credentials and no fetch. COZI_READ_ONLY=true reproduces the
documented behaviour: tools/list returns only the 6 read tools and
write calls are refused (CLI enforces the same rule).

Appointment recurrence: `repeat` is modelled as a generic object in
the schema literal ({type: "object"}), per the spec; reminders as a
generic array. update_appointment carries appointment_id/year/month
plus optional partial fields including scope and occurrence_day.

Ground truth: FULL documented set, firsthand from the public
cozi_mcp README. Fixture:
harness/fixtures/cozi_mcp-tools-original.json (labelled full set).

## Verified (foreground, from disk)
- Tools: 15/15 — parity.json identical_tools = 15 = total.
- Unit tests: 24/24 pass (fake FetchFn only; missing-variable errors
  naming COZI_USERNAME / COZI_PASSWORD, read-only parsing, login
  exchange + token field variants + no-token failure, URL/method/
  body shaping for every tool, update provided-fields-only, delete
  empty-body {status} mapping, create_appointment repeat/reminders
  passthrough, login-then-call dispatch order, upstream error
  surfacing, unknown-tool rejection).
- tsc: exit 0. dist/cli.js present; `node dist/cli.js --version`
  prints 0.1.0.
- Parity: harness/parity.py vs the fixture → PASS, parity_pct 100.0
  (parity-out/parity.json).
- Stdio checks (real server, no credentials set): tools/list = 15
  tools; with COZI_READ_ONLY=true, tools/list = the 6 read tools
  only; tools/call family_members returned isError
  "COZI_USERNAME environment variable is required"; tools/call
  today succeeded with no credentials; a read-only create_list call
  was refused as an error.
- server.json description 61 chars (≤100); OCI entry has no version
  field; Dockerfile label io.github.CloudCorpRecords/familyorg;
  versions agree (package.json = server.json = npm entry = OCI tag
  = core VERSION = CHANGELOG = 0.1.0); full 19-file factory set
  present.
- Lockfile: CLEAN Route 3 — generated in a temp copy with no
  node_modules via offline `npm install --package-lock-only
  --ignore-scripts`, verified (parses, name @reneturcios/familyorg,
  128 package entries including all-platform @esbuild variants),
  lockfile only copied back; the local build/test used a sibling
  build's node_modules.

## Honest gaps
- DOCUMENTED RECONSTRUCTION: request/response shaping against
  rest.cozi.com (endpoint paths such as /auth/login,
  /family/members, /lists/{id}/items, /calendar/{year}/{month},
  the login token field names, and the remove-items call) was
  written from the public tool spec and the Cozi web API pattern.
  No live Cozi call was made and no real credentials exist anywhere
  in this build — wire behaviour is fake-fetch proven only, and the
  real Cozi API may differ in paths or field names.
- `today` uses the server process's local timezone.
- mcpaudit / mcpvet / shipcheck not yet run — pre-publish gate.
