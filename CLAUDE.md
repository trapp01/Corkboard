# Corkboard

An open-source, self-hosted kanban board that people and AI agents work from
together. Local-first: every device holds all the boards and syncs through a
self-hosted server, which also answers agents at an MCP endpoint.

## Never

- Real tasks never enter the repo: no screenshots of someone's board, no card
  text copied into a fixture. The repo is public and a board is private.
  Invent the content.
- No Trello icons, artwork, colours or fonts, and the product's own name and
  branding never use the Trello name. Naming Trello to say what the layout
  follows is fine. Copied assets would make the project unpublishable.
- An MCP tool never deletes a card, a status or a board. Agents archive, and
  a person can restore. An agent acting on a misread instruction must not be
  able to destroy work.

## Every change

- Read `docs/architecture.md` and `docs/glossary.md` first, and use the
  glossary's words for folders, types, MCP tools and UI copy. Two names for
  one thing make every later search miss half the code, and an agent reading
  a tool description acts on the word it is given.
- Anything that touches sync, a replica store or how the server changes a doc
  ships with a convergence test: two replicas edit apart, reconnect, and end
  byte-for-byte equal with both edits present. Lost edits do not show up in
  single-device tests.
- Client code works on a plain-http origin: no `crypto.subtle`, no
  `crypto.randomUUID`, service worker optional. A homelab address such as
  `http://nas:8422` is not a secure context.
- `model` and `sync` stay free of the DOM and of `node:` imports so they run
  in Node tests and in browsers. The Packages table in the architecture doc
  says what each package owns and refuses to know; it is prose until a lint
  rule lands, and a violation is a review finding.
- A board is read and written through `packages/model` only. The web client
  and the server's MCP tools call its functions and never reach into the Yjs
  maps, so the layout of a doc is decided in one package.
- An MCP tool's description and its error messages are its interface. A
  mistake the caller can fix answers with `isError` and a sentence that says
  what to do next, and gets a line in `packages/server/test/mcp.test.ts`.
- `docs/trello-parity.md` changes in the same change that builds or drops a
  feature, so the list of what works stays true.
- `pnpm test` and `pnpm typecheck` from the root pass before a change is done.
  `pnpm --filter @corkboard/web e2e` runs the browser tests against a real
  server; run it for any change to `web`, `sync` or `server`.
- A file past 500 lines is a signal to stop and ask whether it has a second job.

## Layout

pnpm workspace, TypeScript, vitest. Packages are consumed as TypeScript source
through the workspace; only `web` and `server` have a build. Folders inside
`packages/web/src` are by domain (board, card, labels, …), not by file type.
`packages/sync` and the storage half of `packages/server` began as copies of
Looseleaf's; a fix to the wire protocol or the disk store belongs in both
repos.
