# familyorg

Run a Cozi family account from an MCP client: who is in the family,
the shopping and to-do lists everyone shares, and the family calendar
with its appointments. familyorg is a clean-room rebuild of the
documented surface of the unofficial `cozi_mcp` server, under a new
name: fresh code written from the public tool spec, no copied code or
branding.

This is an unofficial client. It is not affiliated with Cozi.

## Tools (full documented set, 15)

Reads: `family_members`, `get_lists`, `get_list_items`, `today`,
`get_calendar`, `search_calendar`.

Writes: `create_list`, `rename_list`, `delete_list`, `add_item`,
`update_item`, `remove_items`, `create_appointment`,
`update_appointment`, `delete_appointment`.

Notes on individual tools:

- `get_lists` takes an optional `list_type` of `shopping` or `todo`;
  `get_list_items` takes a `list_id` and an optional
  `include_completed`.
- `today` answers from the local clock only. It needs no Cozi
  credentials and makes no network call.
- `create_appointment` takes `subject`, `start`, and `end`, plus
  optional `attendees`, `all_day`, `notes`, `location`, `repeat`,
  `reminders`, and `notify`. `repeat` is a generic object describing
  the recurrence (for example a frequency, an interval, weekdays, a
  monthly rule, and an until date).
- `update_appointment` and `delete_appointment` are keyed by
  `appointment_id`, `year`, and `month`; updates send only the fields
  provided, and both accept scoping fields such as `scope` and
  `occurrence_day` for recurring appointments.

## Setup

Authentication follows the Cozi web API pattern: a username and
password are exchanged at login for a token, which is then sent with
each request.

```bash
export COZI_USERNAME=you@example.com
export COZI_PASSWORD=your-password
```

Optionally override the API base with `COZI_API_URL`
(default `https://rest.cozi.com`). Without the username or password,
every tool except `today` fails with an error naming the missing
variable.

Set `COZI_READ_ONLY=true` to run in read-only mode: the nine write
tools disappear from the MCP tool list, and any write call is refused.

The request and response shaping against `rest.cozi.com` is a
reconstruction from the documented tool surface; it has not been
verified against a live Cozi account.

## CLI

```bash
npx @reneturcios/familyorg get_calendar '{"year":2026,"month":11}'
npx @reneturcios/familyorg today '{}'
npx @reneturcios/familyorg mcp        # stdio MCP server
```

Each tool name is a subcommand taking one JSON object argument.

## MCP client config

```json
{
  "mcpServers": {
    "familyorg": {
      "command": "npx",
      "args": ["-y", "@reneturcios/familyorg", "mcp"],
      "env": {
        "COZI_USERNAME": "you@example.com",
        "COZI_PASSWORD": "your-password"
      }
    }
  }
}
```

## Docker

```bash
docker run -i -e COZI_USERNAME -e COZI_PASSWORD ghcr.io/cloudcorprecords/familyorg
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
