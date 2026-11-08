/**
 * Live updates over Server-Sent Events (SSE).
 *
 * Each open app keeps one long HTTP response open at GET /api/live. Whenever something happens
 * (a like, a comment, a DM), the server calls broadcast(event) and every open app receives it.
 * SSE is just text: each event is a line "data: {json}" followed by a blank line.
 *
 * The simulation also asks clientCount() so the world only "lives" while someone has the app open
 * (that keeps AI usage at zero when nobody is looking).
 */
import type { ServerResponse } from 'node:http'
import type { LiveEvent } from '../shared/types.ts'

const clients = new Set<ServerResponse>()
const presenceListeners = new Set<(count: number) => void>()

/** Turn this response into an SSE stream and keep it open until the client disconnects. */
export function addClient(res: ServerResponse, hello: LiveEvent): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(`retry: 3000\n\n`)
  res.write(`data: ${JSON.stringify(hello)}\n\n`)
  clients.add(res)
  notifyPresence()

  // A comment line every 20 s keeps proxies and phones from closing an idle connection.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20_000)
  res.on('close', () => {
    clearInterval(keepAlive)
    clients.delete(res)
    notifyPresence()
  })
}

/** Send one event to every open app. */
export function broadcast(event: LiveEvent): void {
  const frame = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients) client.write(frame)
}

/** How many apps are open right now. */
export function clientCount(): number {
  return clients.size
}

/** Get told when apps connect or disconnect. Returns an unsubscribe function. */
export function onPresenceChange(listener: (count: number) => void): () => void {
  presenceListeners.add(listener)
  return () => presenceListeners.delete(listener)
}

function notifyPresence(): void {
  for (const listener of presenceListeners) listener(clients.size)
}
