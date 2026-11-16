# Contributing

Thanks for wanting to help. Corkboard is an early release, so there is plenty
to build.

## Where to start

- [docs/trello-parity.md](docs/trello-parity.md) lists the features of the
  kanban tool the layout follows and whether each is built. Anything marked
  planned is open.
- Bugs and ideas go in [issues](https://github.com/trapp01/Corkboard/issues).
  For anything larger than a small fix, open an issue before writing code so
  the approach is agreed first.

## Set up

Needs Node 22 and pnpm.

```sh
pnpm install
pnpm dev          # the web client with hot reload on :5173, over a dev server on :8423 (token: dev-token)
pnpm test
pnpm typecheck
pnpm --filter @corkboard/web exec playwright install chromium   # once
pnpm --filter @corkboard/web e2e                                # browser tests against a real server
```

Read [docs/architecture.md](docs/architecture.md) and
[docs/glossary.md](docs/glossary.md) first. The glossary's words are the ones
folders, types, MCP tools and interface text use.

## Rules

The project's rules are in [CLAUDE.md](CLAUDE.md), each with its reason. They
apply to people and to coding agents alike. The ones that matter most:

- **No real tasks in the repo.** No screenshots of someone's board, no card
  text copied into a test. Invent the content.
- **No Trello artwork, icons, colours or branding.**
- **A change to sync comes with a convergence test:** two replicas edit apart,
  reconnect, and end equal with both edits present.
- **An MCP tool never deletes a card, a status or a board.** Agents archive.

## Pull requests

- One concern per pull request. A rename or a move goes in its own.
- `pnpm typecheck` and `pnpm test` pass, and the browser tests pass for a
  change to `web`, `sync` or `server`.
- Update `docs/trello-parity.md` in the same change that builds or drops a
  feature.

## Licence

Corkboard is under the [Mozilla Public License 2.0](LICENSE). By contributing
you agree that your contribution is licensed under it.
