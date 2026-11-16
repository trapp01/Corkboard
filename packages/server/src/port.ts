/** Checking whether a port on this computer already has a server behind it. */
import { connect } from 'node:net';

const PROBE_TIMEOUT_MS = 1000;

/**
 * True when something accepts a connection on the port at 127.0.0.1. Listening
 * there can succeed even while another program holds the port on every
 * interface (and the other way round), and agents would then reach the wrong
 * server, so a port is checked by connecting before it is listened on.
 */
export function portAnswers(port: number, host = '127.0.0.1', timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const done = (answered: boolean) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(timeoutMs, () => done(true));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
