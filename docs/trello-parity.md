# Trello parity

The features of Trello's board, taken from its board view, card back, menus
and keyboard shortcuts, and where Corkboard stands on each. Corkboard follows
Trello's layout and mechanics, not its look. Update this file in the change
that builds or drops a feature.

Status: **built**, **partial** (note says what is missing), **planned**,
**not planned** (note says why). Trello's word comes first; Corkboard's word
is in the notes where it differs.

## Board

| Trello | Status | Notes |
| --- | --- | --- |
| Lists side by side, scrolling sideways | built | A list is a **status**. |
| Add, rename, reorder (drag), archive a list | built | |
| Cards stacked in a list, each list scrolling on its own | built | |
| Add a card at the bottom of a list, Enter to add the next | built | |
| Drag a card within a list and between lists | built | Pointer, touch and keyboard. |
| Card front: labels, title, badges for due date, description, checklist, comments, attachments | built | Labels show their names. Also shows the card ref and a links badge. |
| Card covers (image or colour) | planned | |
| List card limit | planned | |
| Collapse a list | planned | |
| Copy or move a whole list | planned | |
| Sort a list by date or name | not planned | A card's place in its status is its importance, set by hand or by an agent. |
| Board background colour | built | One of ten colours. |
| Board background image | planned | |
| Several boards, board switcher | built | |
| Archive and restore a board | built | Trello calls it closing a board. |
| Workspaces holding boards | not planned | One **workspace** per server. |
| Star a board | planned | |
| Board templates | planned | |

## Card

| Trello | Status | Notes |
| --- | --- | --- |
| Card opens over the board at its own address | built | `/c/WEB-12`. |
| Card number and short link | built | The **card ref** is the board key and the number. |
| Title, description in Markdown | built | |
| Labels with a colour and a name; create and edit from the card | built | Ten colours. |
| Due date | partial | A day, no time of day, no start date, no reminders. |
| Mark a card complete | partial | A card is complete when its status has the kind `done`. |
| Checklists | partial | One checklist per card. Items cannot carry a due date or a member. |
| Attachments, pasted or dropped | built | |
| Links to URLs | built | |
| Comments, edit and delete | built | |
| Activity | partial | Records created, moved, archived, restored. Field edits are not recorded. |
| Members, assign and join | not planned | Single-user for now. An **actor** name is recorded on each change. |
| Move a card from the card back | built | The status select. |
| Copy a card | planned | |
| Card templates | planned | |
| Custom fields | planned | |
| Location, voting, stickers | not planned | |
| Watch a card, notifications | planned | |
| Archive and restore a card | built | |
| Delete a card for good | not planned | Archiving is the only way to remove a card, so nothing an agent does is unrecoverable. |

## Finding

| Trello | Status | Notes |
| --- | --- | --- |
| Filter by keyword | built | The search field. |
| Filter by label | built | |
| Filter by due date, activity, completion | planned | `search_cards` over MCP filters by due day. |
| Search across boards | partial | Over MCP (`search_cards`). The web client searches the open board. |
| Archived items view | built | |

## Views

| Trello | Status | Notes |
| --- | --- | --- |
| Board | built | |
| Table, Calendar, Timeline, Dashboard, Map | planned | |

## Keyboard

| Trello | Status | Notes |
| --- | --- | --- |
| `n` add a card | built | To the hovered status. |
| `/` or `f` find | built | `/` focuses search. |
| `c` archive the hovered card | built | With undo. |
| `Enter` open the hovered card | built | |
| `?` shortcut list | built | |
| `Esc` close | built | |
| `j`/`k` move between cards, `t` edit title, `l` labels, `d` dates, `,` `.` move card | planned | |
| `z` undo, `r` repeat | planned | Archiving has its own undo. |

## Beyond Trello

| Feature | Status | Notes |
| --- | --- | --- |
| MCP endpoint for AI agents | built | Read and write; see [agents.md](agents.md). |
| Status kinds (`todo`, `doing`, `done`) | built | Lets an agent name a status by what it means. |
| Self-hosted, one container | built | |
| Offline editing with merge on reconnect | built | |
| A server following an upstream server | built | |
| Links to Looseleaf pages with the page text on the card | built | Needs the server connected to Looseleaf. |
| Live flash on a card another device or an agent changed | built | |
| Automation (Butler), Power-Ups | not planned | Agents over MCP cover the same ground. |
| Import from Trello | planned | From Trello's JSON export. |
| Sharing with other people, permissions | not planned | Single-user for now. The CRDT model allows it later. |
