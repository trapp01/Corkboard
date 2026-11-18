# @corkboard/server

The self-hosted hub that every Corkboard replica syncs through and that AI
agents talk to. It stores docs and blobs on disk, runs the `/sync` WebSocket
endpoint, answers agents at an MCP endpoint, takes a daily snapshot of its
data folder, can follow an upstream server, and serves the built web client.
HTTP and the WebSocket share one port.

## Running

| Command | Does |
| --- | --- |
| `pnpm start` (repo root) | Builds the web client and the server, then runs the server with data in `./data`. |
| `pnpm --filter @corkboard/server dev` | Runs `src/main.ts` with `tsx watch` and the settings in `dev.env`: port 8423, data in `packages/server/data`, token `dev-token`. |
| `pnpm --filter @corkboard/server build` | Bundles the server and its dependencies into `dist/server.js` with esbuild. |
| `pnpm --filter @corkboard/server start` | Runs the bundle: `node dist/server.js`. |
| `docker compose up -d` | Pulls `ghcr.io/trapp01/corkboard:latest` and runs it with a named volume. |
| `docker compose up -d --build` | Builds the image from the repo root `Dockerfile` instead of pulling it. |

The bundle needs only Node 22; copy `dist/server.js` anywhere and run it.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `CORKBOARD_PORT` | `8422` | Port for HTTP and the sync WebSocket. |
| `CORKBOARD_HOST` | unset | The interface to listen on. Unset listens on every interface; `127.0.0.1` keeps the server reachable from this computer only, as the desktop app does. |
| `CORKBOARD_DATA` | `./data` | The data folder (layout below). |
| `CORKBOARD_TOKEN` | unset | The access token. When unset, the server reads `data/token`, or generates a token, writes it there with mode 0600 and prints it once. |
| `CORKBOARD_WEB_DIR` | unset | Folder of the built web client. When unset, the server uses `web/` beside `server.js`, or `packages/web/dist` in a checkout. A folder with no `index.html` is ignored, and the server then answers every non-API path with a one-line notice. |
| `CORKBOARD_MAX_BLOB_BYTES` | `209715200` (200 MB) | Largest attachment accepted. |
| `CORKBOARD_SNAPSHOT_KEEP` | `14` | Daily snapshots to keep. |
| `CORKBOARD_UPSTREAM_URL`, `CORKBOARD_UPSTREAM_TOKEN` | unset | Another Corkboard server to keep in step with (see Upstream). Set both or neither. |
| `CORKBOARD_LOOSELEAF_URL`, `CORKBOARD_LOOSELEAF_TOKEN` | unset | A Looseleaf server to read linked pages from (see Looseleaf). Set both or neither. |
| `CORKBOARD_LOOSELEAF_LINK_URL` | `CORKBOARD_LOOSELEAF_URL` | The address a linked page opens at in a browser. Set it when this server reaches Looseleaf at an address a browser cannot use, such as a compose service name. |

The token keeps other devices on a private network (such as a tailnet) out.
It is not a substitute for TLS on a public network; put the server behind
`tailscale serve` or a TLS reverse proxy for that.

## Routes

| Route | Auth | Answer |
| --- | --- | --- |
| `GET /api/info` | none | `{ "name": "corkboard", "version": "…", "protocol": 1 }` |
| `GET /api/health` | none | `{ "ok": true }` |
| `GET /api/blobs` | bearer | `{ "blobs": ["<sha256>", …] }` |
| `GET /api/blobs/<sha256>` | bearer | The bytes, or 404. |
| `PUT /api/blobs/<sha256>` | bearer | 201 stored, 200 already stored, 400 when the bytes do not hash to the name, 413 past the size limit. |
| `GET /api/looseleaf/pages/<pageId>` | bearer | `{ "markdown": "…" }`, or 404 when no Looseleaf server is configured, it cannot be reached or it has no such page. |
| `POST /mcp` | bearer | The MCP endpoint (see MCP endpoint). `GET` and `DELETE` answer 405. |
| `GET /sync` | token in the hello | The WebSocket sync endpoint; see "Wire protocol" in `docs/architecture.md`. A bad token closes with 4401. |
| anything else | none | The web client's files, `index.html` for unknown paths. |

Every response carries `Access-Control-Allow-Origin: *`; the token is the gate.

## MCP endpoint

`POST /mcp` speaks the [Model Context Protocol](https://modelcontextprotocol.io)
over streamable HTTP, so an AI agent can read the boards and keep them up to
date. It is stateless and answers every request with plain JSON: no sessions
and no event stream. It takes the bearer token. A request body over 256 KB is
refused with 413.

Connect Claude Code to it:

```sh
claude mcp add --transport http corkboard http://<your-server>:8422/mcp \
  --header "Authorization: Bearer <token>"
```

Any MCP client that can send that header to that address works.

| Tool | Does |
| --- | --- |
| `list_boards` | Every board with its key, statuses (kind and card count) and labels. |
| `get_board` | One board at a glance: each status with its cards, top first. Can be narrowed to a status or a label. |
| `search_cards` | Cards by words and by board, status, label and due day, across every board. |
| `get_card` | Everything on one card as Markdown, with the text of linked Looseleaf pages. |
| `create_card` | A new card with a description, labels, due day, checklist and links. |
| `update_card` | Title, description (replace or append), due day, labels. |
| `move_card` | A card to a status, at the top, the bottom or a position. An archived card is refused until it is restored. |
| `add_comment` | A Markdown comment. |
| `update_checklist` | Add, tick, untick and remove checklist items. |
| `add_link` | A link to a URL or to a Looseleaf page. |
| `archive_card` | Archive or restore a card. |
| `create_board` | A board with the default statuses. |
| `create_status` | A status with its kind, at a position. |
| `create_label` | A label with a colour. |

A caller names a board by its key or name, a card by its ref (`WEB-12`), its
address or its id, a status by its name or its kind (`todo`, `doing`, `done`, for
the first status of that kind), and a label by its name. Tools that write take
an optional `author`, recorded in the card's activity; it is `Agent` when left
out. No tool deletes a card, a status or a board.

The `initialize` reply carries instructions that tell an agent to find or
make the card for its task, move it to a `doing` status before it starts, and
record progress on it. [docs/agents.md](../../docs/agents.md) has the text to
put in a project's own agent instructions.

## Looseleaf

With `CORKBOARD_LOOSELEAF_URL` and `CORKBOARD_LOOSELEAF_TOKEN` set, a card
link written `looseleaf:<pageId>` is read from that
[Looseleaf](https://github.com/trapp01/Looseleaf) server as Markdown: `get_card`
puts the page text under the link, and the web client shows it on the card.
Corkboard only reads from Looseleaf, and a Looseleaf server that cannot be
reached leaves the text out without failing anything.

## Upstream

With `CORKBOARD_UPSTREAM_URL` and `CORKBOARD_UPSTREAM_TOKEN` set, the server
keeps in step with another Corkboard server. Everything either one holds is
exchanged at each connect and every change after that travels both ways, so
browsers and agents on either server see the same boards. Attachments are
compared and copied at each connect and a few seconds after each change. The
link reconnects on its own; a refused token stops it until the next start.

To move from a copy on one computer to a server elsewhere: start the new
server, then restart the first one with the two variables pointing at it. The
boards appear on the new server, and the first one can keep running as an
offline copy or be stopped.

## Data folder

```
data/
  token                   access token, when generated
  docs/<docId>/snapshot   one merged Yjs update, replaced by atomic rename
  docs/<docId>/log        updates since the snapshot: [u32 length][u32 crc32][bytes], little-endian
  docs/<docId>/*.corrupt-<time>  damaged bytes set aside on read; safe to delete
  blobs/<aa>/<sha256>     blob bytes; aa is the hash's first two hex digits
  snapshots/<yyyy-mm-dd>/ daily copies of docs/ and blobs/ (blobs hard-linked)
  tmp/                    partial writes; emptied at startup
```

Doc ids are percent-encoded for folder names. Every log append is fsynced
before the update is relayed to other devices, and snapshots and blobs are
written to `tmp/`, fsynced and renamed into place. A log record with a wrong
length or checksum ends the log: it and everything after it are moved to
`log.corrupt-<time>` beside the log, and the next handshake with any device
restores what was lost.

Plain files mean the folder can be backed up with rsync, restic or a ZFS
snapshot while the server runs.

## Snapshots and restore

At startup, and then hourly, the server checks for today's snapshot (server
local date) and writes `snapshots/<yyyy-mm-dd>/` when it is missing, keeping
the newest `CORKBOARD_SNAPSHOT_KEEP`. Each doc's snapshot and log are copied
together, between that doc's writes, so a dated copy never holds half of a
compaction.

To restore a snapshot, stop the server, then from the folder that holds
`data/` run (with the date you want):

```sh
DAY=2026-11-14; mv data/docs data/docs.before-restore && mv data/blobs data/blobs.before-restore && cp -a data/snapshots/$DAY/docs data/snapshots/$DAY/blobs data/
```

With the compose file's named volume, run the same command inside the volume:

```sh
docker compose stop corkboard
docker compose run --rm --no-deps --entrypoint sh corkboard -c 'DAY=2026-11-14; cd /data && mv docs docs.before-restore && mv blobs blobs.before-restore && cp -a snapshots/$DAY/docs snapshots/$DAY/blobs ./'
docker compose start corkboard
```

Then start the server. Each device's next handshake sends back everything it
holds that the snapshot lacks, so a restore recovers lost data and never
removes edits a device still has. To make the snapshot the only state, clear
the local data of every device before it reconnects. Delete the
`*.before-restore` folders once the restore looks right.

A lost server needs no snapshot at all: start an empty one with the same
token, and the devices fill it on their next handshake.
