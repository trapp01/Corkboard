# Glossary

One name per thing. Folders, types, config keys, MCP tools and UI copy use these words.

| Word | Meaning | Owning folder |
| --- | --- | --- |
| **Workspace** | Every board a person has. One per server and per device. | `packages/model` |
| **Board** | One kanban board: statuses, labels and cards. | `packages/model` |
| **Board key** | The short uppercase prefix of a board's card refs, such as `WEB`. Set when the board is made; a person cannot change it. The server changes it once when two boards made apart took the same key. | `packages/model` |
| **Status** | A column of a board. A card is in exactly one. Trello calls it a list. | `packages/model` |
| **Status kind** | What a status means for the work on its cards, whatever it is called: `todo`, `doing` or `done`. | `packages/model` |
| **Card** | One task on a board. | `packages/model` |
| **Card ref** | A card's name in text: the board key, a dash and the card's number, such as `WEB-12`. | `packages/model` |
| **Card id** | A card's permanent 21-character id. A ref is what people use; the id is what never changes. | `packages/model` |
| **Label** | A coloured tag defined on a board. A card can carry several; they say what a card is about across statuses. | `packages/model` |
| **Checklist** | The ordered steps on a card, each done or not. A card has one. | `packages/model` |
| **Comment** | A Markdown note on a card, with who wrote it and when. | `packages/model` |
| **Link** | A pointer from a card to something outside the board: a URL, or a Looseleaf page written `looseleaf:<pageId>`. | `packages/model` |
| **Attachment** | A blob recorded on a card, with its file name. | `packages/model` |
| **Activity** | A card's history: created, moved between statuses, archived, restored. | `packages/model` |
| **Actor** | The name recorded as having made a change: the name a person gave their device, or the name an agent passed. | `packages/model` |
| **Archive** | Hiding a card, a status or a board without deleting it. Everything archived can be restored. Nothing is ever deleted outright except labels, checklist items, comments, links and attachments. | `packages/model` |
| **Agent** | An AI assistant working on the board through the MCP endpoint. | `packages/server` |
| **Blob** | An immutable binary (an attached file) named by the SHA-256 of its bytes. | `packages/sync` |
| **Doc** | One unit of sync: a Yjs document with a string id. The workspace and each board are separate docs. | `packages/sync` |
| **Replica** | One device's full local copy of every doc and blob. | `packages/sync` |
| **Replica store** | Where a replica keeps its docs and blobs on the device. | `packages/sync` |
| **Server** | The self-hosted hub that replicas sync through and agents talk to. It is also a replica store, on disk. | `packages/server` |
| **Desktop app** | Corkboard for macOS, Windows and Linux: a server on this computer, reachable from this computer only, with a window onto it. Its server can follow an upstream, which the app calls the server to sync with. | `packages/desktop` |
| **Upstream** | Another Corkboard server that a server keeps in step with, so a copy on a laptop follows the one on a homelab. | `packages/server` |
| **Snapshot** | A dated copy of the server's docs and blobs, kept for point-in-time restore. | `packages/server` |
| **Update manifest** | `latest.json` on the release CI replaces with every build: the newest Mac build's version, zip name, sha256 and size. The desktop app reads it to update itself. | `packages/desktop/src/updater.ts` |
