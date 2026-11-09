/**
 * Live updates over Server-Sent Events (SSE).
 *
 * Each open app keeps one long HTTP response open at GET /api/live. Whenever something happens
 * (a like, a comment, a DM), the server calls broadcast(event) and every app open on that world
 * receives it. SSE is just text: each event is a line "data: {json}" followed by a blank line.
 *
 * Streams belong to the world of the request that opened them, and broadcast() only reaches the
 * current world's apps, so one person never sees another person's events. Signing out ends the
 * streams that were opened with that session.
 *
 * The simulation also asks clientCount() so a world only "lives" while someone has the app open
 * (that keeps AI usage at zero when nobody is looking).
 */
import type { ServerResponse } from 'node:http'
import type { LiveEvent } from '../shared/types.ts'
import { currentWorldId, withWorld } from './db/index.ts'

/** world id -> the open streams of that world. */
const clientsByWorld = new Map<string, Set<ServerResponse>>()
/** session key (see auth/sessions.ts) -> the open streams opened with that session. */
const clientsBySession = new Map<string, Set<ServerResponse>>()
const presenceListeners = new Set<(count: number) => void>()

function addTo(groups: Map<string, Set<ServerResponse>>, key: string, res: ServerResponse): void {
  const group = groups.get(key) ?? new Set<ServerResponse>()
  group.add(res)
  groups.set(key, group)
}

function removeFrom(groups: Map<string, Set<ServerResponse>>, key: string, res: ServerResponse): void {
  const group = groups.get(key)
  group?.delete(res)
  if (group?.size === 0) groups.delete(key)
}

/**
 * Turn this response into an SSE stream of the current world, and keep it open until the client
 * disconnects (or signs out: pass the request's session key).
 */
export function addClient(res: ServerResponse, hello: LiveEvent, sessionKey: string | null = null): void {
  const worldId = currentWorldId()
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(`retry: 3000\n\n`)
  res.write(`data: ${JSON.stringify(hello)}\n\n`)
  addTo(clientsByWorld, worldId, res)
  if (sessionKey) addTo(clientsBySession, sessionKey, res)
  notifyPresence(worldId)

  // A comment line every 20 s keeps proxies and phones from closing an idle connection.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20_000)
  res.on('close', () => {
    clearInterval(keepAlive)
    removeFrom(clientsByWorld, worldId, res)
    if (sessionKey) removeFrom(clientsBySession, sessionKey, res)
    // 'close' comes from the network, outside any world, so step back into this stream's world.
    withWorld(worldId, () => notifyPresence(worldId))
  })
}

/** Signing out: end every stream that was opened with this session. */
export function closeSessionStreams(sessionKey: string): void {
  for (const res of [...(clientsBySession.get(sessionKey) ?? [])]) res.end()
}

/** Send one event to every app open on the current world. */
export function broadcast(event: LiveEvent): void {
  const clients = clientsByWorld.get(currentWorldId())
  if (!clients) return
  const frame = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients) client.write(frame)
}

/** How many apps are open on the current world right now. */
export function clientCount(): number {
  return clientsByWorld.get(currentWorldId())?.size ?? 0
}

/**
 * Get told when apps connect to or disconnect from a world. The listener runs inside that world
 * and gets its new count. Returns an unsubscribe function.
 */
export function onPresenceChange(listener: (count: number) => void): () => void {
  presenceListeners.add(listener)
  return () => presenceListeners.delete(listener)
}

function notifyPresence(worldId: string): void {
  const count = clientsByWorld.get(worldId)?.size ?? 0
  for (const listener of presenceListeners) {
    try {
      listener(count)
    } catch (error) {
      console.error('[live] presence listener failed:', error)
    }
  }
}
