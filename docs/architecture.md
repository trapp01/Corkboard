# Architecture

Corkboard is a local-first kanban board that people and AI agents work from
together. Every device holds a full copy of the boards and works offline. A
self-hosted server is the hub the devices sync through, the place backups
live, and the thing agents talk to. Words in **bold** are defined in
[glossary.md](glossary.md).

Corkboard is the sibling of [Looseleaf](https://github.com/trapp01/Looseleaf),
a notebook app built the same way. `packages/sync` and the storage half of
`packages/server` began as copies of Looseleaf's and keep its wire protocol.

## Packages

| Package | Owns | Refuses to know |
| --- | --- | --- |
| `packages/model` | What a workspace, board, status, card and label are; reading and writing them inside Yjs docs; card refs and link targets; search; a board and a card as Markdown. | Networking, storage, the DOM, React. |
| `packages/sync` | The wire protocol, the replica store interface, and the client that keeps a replica in step with a server. | What is inside a doc. Doc ids and bytes are opaque. |
| `packages/server` | The hub: doc and blob storage on disk, the sync endpoint, snapshots, the MCP endpoint, the link to an upstream server, reading linked pages from Looseleaf, serving the web client. | What is inside a doc, except in `boards.ts` and the MCP tool files, which read and change boards only through `model`. |
| `packages/web` | The user interface. Runs in a browser and in the desktop app's window. | Disk paths, and how a doc is laid out inside Yjs (it reads and writes through `model`). |
| `packages/desktop` | The **desktop app**: a server started in its own process on 127.0.0.1, the window onto it, the native menu, and the app's settings (the server to sync with, the Looseleaf server). | What is inside a doc. It starts the server through `@corkboard/server` and talks to the web client only through the bridge in `packages/web/src/shell-bridge.ts`. |

Imports flow one way: `web → model, sync`; `server → sync, model`;
`desktop → server, sync`, plus the bridge's types from `web`. `model` and
`sync` do not import each other. This is prose until a lint rule lands; a
violation is a review finding.

## Why CRDTs

A person can drag a card on their laptop while an agent comments on it through
the server and a phone edits its description offline. None of those changes
may be lost. Corkboard stores every doc as a [Yjs](https://yjs.dev) CRDT: each
edit is an operation that merges with any other edit in any order and always
converges to the same result.

Where a single value is set twice at once (a card's title, its status, its
place in a status) the later writer wins for that one field. A card's
description is a text, so two edits to different parts of it both survive.

Archiving never destroys content. An archived card, status or board has
`archivedAt` set and can be restored.

## Docs

A **doc** is one Yjs document. Doc ids are strings:

| Doc id | Holds |
| --- | --- |
| `workspace` | The list of boards. |
| `board:<boardId>` | One board: its statuses, labels and cards with everything on them. |

Ids are 21-character nanoid strings.

### `workspace`

`doc.getMap('boards')`: boardId → `Y.Map` with

- `name: string`
- `key: string` — the **board key**
- `color: string` (one of the colour names in `model`)
- `order: string` (fractional index; see Ordering)
- `createdAt: number` (epoch ms)
- `archivedAt: number | null`

### `board:<boardId>`

`doc.getMap('statuses')`: statusId → `Y.Map` with `name`, `kind: 'todo' |
'doing' | 'done'`, `order`, `archivedAt`.

`doc.getMap('labels')`: labelId → `Y.Map` with `name`, `color`, `order`.

`doc.getMap('cards')`: cardId → `Y.Map` with

- `number: number` — the number in the **card ref**
- `title: string`
- `status: string` — a status id
- `order: string` — the card's place in its status
- `description: Y.Text` — Markdown
- `labels: Y.Map` — labelId → `true`
- `due: string | null` — a calendar day, `YYYY-MM-DD`
- `checklist: Y.Map` — itemId → `Y.Map` with `text`, `done`, `order`
- `comments: Y.Map` — commentId → `{ body, by, at, editedAt }`
- `links: Y.Map` — linkId → `{ target, title, at }`
- `attachments: Y.Map` — attachmentId → `{ blob, name, mime, size, at }`
- `activity: Y.Array` — `{ type, at, by, … }` entries, oldest first
- `createdAt`, `createdBy`, `updatedAt`, `archivedAt`

Comments, links and attachments are plain objects written once and replaced
whole. A card whose status is archived is hidden with it and comes back when
the status is restored. A card whose status this replica has never seen shows
under the board's first status.

`readBoard` in `model` turns a board doc into plain objects (a
`BoardSnapshot`); the web client, the search and the Markdown renderers work
from that and never touch the Yjs types.

### Card numbers and board keys

A new card takes one past the highest number on its board, on whichever
replica makes it. Two replicas that are apart can therefore give two cards the
same number, and two boards the same key. The server repairs both after every
change it stores (`Boards.repair`): the card or board created first keeps its
number or key, the others get new ones, and a number or key only one card or
board uses is never changed. Only servers repair, and the repair is the same
calculation on every server, so two linked servers reach the same result.

A card's ref can therefore change once: when a card made on a replica that
was apart (a browser offline, or a server whose upstream was down) meets a
card with the same number. Until a card has reached every server it syncs
through, its id is the handle that cannot change; `get_card` prints it and
every MCP tool takes it in place of a ref.

### Ordering

Siblings sort by their `order` string, then by id as a tiebreak. Inserting
between two siblings generates a new string between their two; no other
sibling is rewritten. `model` wraps the `fractional-indexing` package.

## Sync

### Replica store

`packages/sync` defines `ReplicaStore`: append a doc update, read a doc's
updates, compact them, put and get a blob, list doc ids. The browser uses the
IndexedDB implementation. The server uses the disk implementation. Tests use
the in-memory one.

A client writes an edit to its replica store before it sends it anywhere. The
replica store is the source of truth for that device.

### Wire protocol

One WebSocket per client at `/sync`. All docs share it.

1. Client sends text frame `{"t":"hello","token":"…","replica":"<id>","v":1}`.
2. Server answers `{"t":"welcome","docs":["workspace","board:…", …]}` listing
   every doc id it holds, or closes with code 4401 on a bad token.
3. For every doc id known to either side, both sides run the Yjs handshake:
   send your state vector, receive the other side's missing operations.
4. After a doc's handshake, each side forwards every new update for it as it
   happens. The server persists an update before relaying it to the other
   connected clients.

Binary frames are `[varuint type][varstring docId][payload]`:

| Type | Payload |
| --- | --- |
| 0 `StateVector` | The sender's state vector. The receiver replies with type 1. |
| 1 `Diff` | Everything the sender has that the state vector lacks. |
| 2 `Update` | One incremental update. |

Every reconnect repeats step 3 for every doc. The handshake is what makes the
system self-healing: whatever one side is missing, for any reason, the other
side supplies.

### Blobs

`PUT /api/blobs/<sha256>` and `GET /api/blobs/<sha256>` with
`Authorization: Bearer <token>`. The server verifies the hash on upload. Blobs
are immutable, so they cannot conflict. Attachments are the only blobs.

### Access

The server has one access token (`CORKBOARD_TOKEN`; generated and written to
the data folder on first start when unset). The intended network is a private
one such as a tailnet. The token keeps other devices on that network out; it is
not a substitute for TLS on a public network.

### Insecure origins

A homelab address such as `http://nas:8422` is not a secure context. In it the
browser has no `crypto.subtle`, no `crypto.randomUUID` and no service worker.
Client code hashes with `@noble/hashes`, makes ids with `nanoid`, and treats the
service worker as optional.

## The server changing a doc

The hub (`hub.ts`) never looks inside a doc. It offers two methods to the rest
of the server: `read(docId, fn)` runs `fn` on the doc, and `edit(docId, fn)`
runs `fn` in one transaction, stores what changed and relays it to every
connection. An edit made by an agent therefore travels exactly like an edit
made in a browser, and shows up in every open client at once.

`boards.ts` is where the server knows what a board is, through `model`: it
finds a board or a card from what a caller typed, and runs the repair above.

## MCP endpoint

`POST /mcp` speaks the Model Context Protocol (streamable HTTP, stateless,
JSON responses; `GET` and `DELETE` answer 405) and takes the same bearer token
as the blob routes. The protocol is in `mcp.ts`; the runtime uses no MCP SDK.

A tool's definition and what it does sit together, in `mcp-read-tools.ts`
(`list_boards`, `get_board`, `search_cards`, `get_card`) and
`mcp-write-tools.ts` (`create_card`, `update_card`, `move_card`, `add_comment`,
`update_checklist`, `add_link`, `archive_card`, `create_board`,
`create_status`, `create_label`). `mcp-tools.ts` checks a call's arguments
against the tool's schema. Tools answer in Markdown rendered by `model`. A
mistake the caller can fix is a result with `isError` set and a sentence that
says what to do next.

Callers name things the way a person would: a board by key or name, a card by
ref, a status by name or by kind, a label by name. The `initialize` reply
carries instructions that tell an agent to find or make the card for its task,
move it to a `doing` status before starting, and record progress on it.

## Looseleaf

A card **link** whose target is `looseleaf:<pageId>` points at a page in
Looseleaf. When `CORKBOARD_LOOSELEAF_URL` and `CORKBOARD_LOOSELEAF_TOKEN` are
set, `looseleaf.ts` reads such a page as Markdown from that Looseleaf server's
own MCP endpoint. `get_card` includes the text under the link, and the web
client fetches it from `GET /api/looseleaf/pages/<pageId>` to show on the card.
Looseleaf being unreachable is an ordinary "no text", never a failed request.
Corkboard only reads from Looseleaf.

## Upstream

A server started with `CORKBOARD_UPSTREAM_URL` and `CORKBOARD_UPSTREAM_TOKEN`
keeps in step with another Corkboard server (`upstream.ts`). It connects to the
upstream's `/sync` as a client; once welcomed, the hub runs the handshake for
every doc either side holds and from then on relays to the upstream like any
client. Blobs are compared and copied both ways over the blob routes at each
connect and shortly after each doc change. The link reconnects with backoff.

This is how a copy on a laptop is tried out first and joined to a homelab
server later: start the homelab server, point the laptop's server at it, and
the two converge.

## Desktop app

Agents reach boards only through a running server, so the desktop app is a
server with a window. Its Electron main process calls `startServer` with
`host: '127.0.0.1'`, a data folder in the app's user data and the built web
client from the app's resources, then opens a window on
`http://127.0.0.1:<port>/`. The page is served by that server and syncs with
it exactly as a browser does with any server; agents on the same computer use
its MCP endpoint with the token in its data folder.

The port is 8422, so an agent's configuration keeps working. When another
program answers there, the app starts on the port it fell back to last time,
or a free one, and tells the person at each start while 8422 stays taken. The window's origin includes the
port, so remembering the fallback keeps the window's replica and name.

The page reaches the app through `window.corkboardShell` (declared in
`packages/web/src/shell-bridge.ts`, set by the preload script). Through it the
page learns the app server's address and token, so first run asks only where
boards sync and for a name, and Settings saves the server to sync with and the
Looseleaf server. Those two become `upstream` and `looseleaf` in
`ServerOptions`; saving one writes the app's settings file and restarts the
app's server on the same port, and the page's sync client reconnects on its
own. The sync status then speaks for the link to the server to sync with, or
says the boards are on this computer only.

`packages/desktop/README.md` has the lifecycle, the security settings and the
packaging.

## Server data folder

```
data/
  token                 access token, when generated
  docs/<docId>/snapshot  one merged Yjs update, replaced by atomic rename
  docs/<docId>/log       framed updates since the snapshot: [u32 length][u32 crc32][bytes]
  blobs/<aa>/<sha256>
  snapshots/<yyyy-mm-dd>/  dated copies of docs/ and blobs/ (blobs hard-linked)
```

Doc ids are percent-encoded for the folder name. A log record whose length or
checksum is wrong ends the log; the reader moves it and everything after it to
`log.corrupt-<time>`, and the next handshake restores whatever was lost. Plain
files mean the data folder can be backed up with rsync, restic or a ZFS
snapshot.

## Web client

One React app, served by the server and connecting to its own origin. Layout
follows Trello: statuses side by side as columns, cards stacked in each, a
card opening over the board at its own address (`/c/WEB-12`; a board is at
`/b/WEB`). Under 768 px wide the columns scroll sideways one at a time and a
card opens full screen.
