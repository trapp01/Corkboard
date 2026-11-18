/**
 * Reading a page from a Looseleaf server, so a card that links to one can
 * show what the page says. It asks Looseleaf's own MCP endpoint for the page
 * as Markdown. Looseleaf being away, or the page being gone, is an ordinary
 * answer of null, never a failure of the caller's request.
 */
import { looseleafWebAddress } from '@corkboard/model';

export interface LooseleafAccess {
  /** The Looseleaf server's address, e.g. `http://127.0.0.1:8421`. */
  url: string;
  token: string;
  /** The address people open Looseleaf's web client at, when this server reaches Looseleaf at a different one (a compose service name, say). */
  linkUrl?: string;
}

/** A page that is not answered within this time is treated as unavailable. */
export const LOOSELEAF_TIMEOUT_MS = 5000;

type Fetch = typeof globalThis.fetch;

export class Looseleaf {
  private readonly endpoint: string;

  constructor(
    private readonly access: LooseleafAccess,
    private readonly fetch: Fetch = globalThis.fetch,
  ) {
    this.endpoint = `${access.url.replace(/\/+$/, '')}/mcp`;
  }

  /** The address the page opens at in Looseleaf's web client. */
  pageAddress(pageId: string): string {
    return looseleafWebAddress(this.access.linkUrl || this.access.url, pageId);
  }

  /** The page as Markdown, or null when Looseleaf cannot be reached or has no such page. */
  async readPage(pageId: string): Promise<string | null> {
    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${this.access.token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_page', arguments: { page_id: pageId } } }),
        signal: AbortSignal.timeout(LOOSELEAF_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const reply = (await response.json()) as { result?: { isError?: boolean; content?: Array<{ type: string; text?: string }> } };
      if (reply.result === undefined || reply.result.isError === true) return null;
      const text = reply.result.content?.find((block) => block.type === 'text')?.text;
      return typeof text === 'string' ? text : null;
    } catch {
      return null;
    }
  }
}
