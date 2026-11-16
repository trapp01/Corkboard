# Security

## Reporting a vulnerability

Please report it privately through
[GitHub's private vulnerability reporting](https://github.com/trapp01/Corkboard/security/advisories/new),
not in a public issue. Say what you found, how to reproduce it and which
version or commit you tested.

Corkboard is an early release maintained in spare time. Fixes land on `main`;
there are no maintained older versions yet.

## What the server protects against

The server is built for a private network such as a tailnet. One access token
keeps other devices on that network out, and it is the same token for the web
client, the sync endpoint and the MCP endpoint: anything holding it can read
and change every board. The token is not a substitute for TLS: over plain
`http` it travels unencrypted, so do not expose the port to the internet
without HTTPS in front of it.

Boards are stored unencrypted in the server's data folder and in each device's
browser storage. Anyone who can read those can read the boards.

## Agents

An AI assistant connected to the MCP endpoint can create, edit, move and
archive cards and add boards, statuses and labels. It cannot delete a card, a
status or a board; everything it archives can be restored. Card text is
written by people and by other agents, so an agent reading a card is reading
untrusted text.
