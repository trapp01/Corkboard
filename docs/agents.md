# Working the board with an AI agent

Corkboard's server answers AI assistants at an MCP endpoint, `POST /mcp`. An
agent connected to it can read every board and keep cards up to date while it
works, and what it changes shows in every open browser at once.

## Connect

Claude Code:

```sh
claude mcp add --transport http --scope user corkboard http://127.0.0.1:8422/mcp \
  --header "Authorization: Bearer <token>"
```

The token is the server's access token: the one printed at first start, kept
in `data/token`, and shown in the web client under **Connect an assistant**.
Any MCP client that can send that header to that address works the same way.

## What the agent is told

The server sends these instructions to every agent that connects, so nothing
has to be configured for an agent to behave:

1. Before starting a task, find its card (`search_cards`, or the ref the
   person gave, such as `WEB-12`) and read it in full with `get_card`. When no
   card exists, make one with a description someone with no other context
   could pick up. Then move it to a status of kind `doing`.
2. While working, tick checklist items as they are finished, comment when
   there is a finding, a decision or a blocker, and link branches and pull
   requests.
3. When stopping, comment with what was done, what is left and how to check
   it, and move the card to a `done` status when it is finished.
4. Something ruled out of scope or wanted later becomes its own card in a
   `todo` status.
5. Change only the cards the task is about, and archive only when asked.
6. A subagent doing one piece of another agent's task reads cards when they
   help and changes none; the agent that handed out the piece owns the card.

## Making it a habit in a project

The instructions above are a default. To make a project's agents start from
the board every time, add something like this to the project's agent
instructions (`CLAUDE.md`, `AGENTS.md`):

```markdown
## Task board

Tasks for this project are on the Corkboard board with the key WEB (MCP
server `corkboard`).

- Before starting any task, find its card or create one, read it with
  get_card, and move it to In progress.
- Work the card's checklist; tick items as they are finished.
- When you stop, comment on the card with what was done, what is left and how
  to verify it. Move it to Done only when it is finished and verified.
- Anything I say is out of scope or for later goes on the board as a new card
  in Backlog with the label of the app it touches.
```

## What a card gives an agent

`get_card` answers with the whole card as Markdown: where it stands, its
labels and due day, the description, the checklist with item ids, links,
comments and activity. It is written to be enough to pick the task up cold.

A person's side of that bargain is the description. A card that says what is
wanted, why, and how to tell it is finished lets an agent start without a
conversation.

## Statuses and kinds

A board's statuses are its columns, and they can be called anything. Each has
a **kind**: `todo`, `doing` or `done`. Agents can name a status by its kind,
so "move it to doing" works on a board whose column is called "In progress",
"Building" or "On the bench". Set a status's kind from its menu in the web
client.

## With Looseleaf

[Looseleaf](https://github.com/trapp01/Looseleaf) is a notebook app built the
same way as Corkboard, and the two are meant to be used together: Looseleaf
holds the notes, scopes and loose thoughts; Corkboard holds the tasks and
where each one stands.

- A card links to a Looseleaf page with a link whose target is
  `looseleaf:<pageId>`. Page ids come from Looseleaf's own MCP tools
  (`search_notes`, `list_pages`).
- When the Corkboard server is started with `CORKBOARD_LOOSELEAF_URL` and
  `CORKBOARD_LOOSELEAF_TOKEN`, `get_card` includes the text of each linked
  page, so an agent reading a card also reads the scope written in the
  notebook. The web client shows the same text on the card.
- An agent connected to both servers can turn a scope into tasks: read the
  page in Looseleaf, create a card per task on the board, and link each card
  back to the page. It can also go the other way and write a note into
  Looseleaf, with the card's ref in it, for a thought that is not yet a task.

A prompt that does the first of those:

> Read my page "Checkout rework scope" in Looseleaf. For each piece of work in
> it, create a card on the WEB board in Backlog with the label for the app it
> touches, a description I could hand to someone else, and a link back to the
> page. Put anything the page calls out of scope in one card titled "Checkout
> rework: later". Then show me the board.
