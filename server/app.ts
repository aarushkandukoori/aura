/**
 * The Express app: sign-in under /auth, the JSON API under /api, the generated library under
 * /content, uploads under /media, and (after `npm run build`) the web app itself.
 *
 * It's a function so tests can build an app on a random port without starting the simulation.
 */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express'
import { HttpError } from './api/http.ts'
import { apiRouter } from './api/index.ts'
import { authRoutes } from './auth/routes.ts'
import { authEnabled, config } from './config.ts'
import { isWorldId, LOCAL_WORLD, worldUploadsDir } from './db/index.ts'

export function createApp(): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(onlyThisApp)
  app.use(safetyHeaders)
  app.use(express.json({ limit: '2mb' }))
  app.use(authRoutes())
  app.use('/api', apiRouter())

  // Library images never change once drawn, and uploads get random names, so both cache well.
  // fallthrough: false makes a missing file a plain 404 (never the web app's index.html), which
  // lets the apps show their placeholder while images are still being generated.
  app.use('/content', express.static(config.contentDir, { maxAge: '7d', fallthrough: false }))
  serveUploads(app)

  // The built web app (npm run build). Vite gives files in /assets hashed names: cache forever.
  const indexHtml = path.join(config.webDist, 'index.html')
  app.use('/assets', express.static(path.join(config.webDist, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }))
  app.use(express.static(config.webDist, { index: false }))
  // Every other page (/, /explore, /p/123...) is the single-page app; React picks the screen.
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !fs.existsSync(indexHtml)) return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexHtml)
  })

  app.use(() => {
    throw new HttpError(404, 'Not found')
  })
  app.use(errorHandler)
  return app
}

/**
 * Uploaded photos and videos (see server/repo/files.ts for the URL shapes). Local mode keeps
 * /media/uploads/<file>; with sign-in each world has /media/<world id>/<file>. File names are long
 * random strings, so a link to an upload only works for someone who was given it, like on most
 * photo apps, and image tags in both apps load them without sending a session.
 */
function serveUploads(app: Express): void {
  const options = { maxAge: '30d', immutable: true }
  if (!authEnabled) {
    app.use('/media/uploads', express.static(worldUploadsDir(LOCAL_WORLD), { ...options, fallthrough: false }))
    return
  }
  app.get('/media/:worldId/:file', (req, res, next) => {
    const { worldId, file } = req.params
    if (worldId === LOCAL_WORLD || !isWorldId(worldId)) throw new HttpError(404, 'Not found')
    // `root` keeps the file inside that world's uploads folder, whatever the name says ("../x" is refused).
    res.sendFile(file, { ...options, root: worldUploadsDir(worldId) }, (error) => {
      if (error) next(new HttpError(404, 'Not found'))
    })
  })
}

/** The host people use to reach a public server (AURA_PUBLIC_URL), e.g. "aura.example.com". */
const publicHost = new URL(config.publicUrl).host.toLowerCase()

/**
 * Only Aura's own apps may use the server, never another website open in the same browser:
 * - Any website can make the browser send a POST to localhost (say to /api/reset). Browsers say
 *   which page a request comes from in the Origin header, so changes must come from this host.
 * - "DNS rebinding": a website points its own domain at 127.0.0.1 to read your DMs. The browser
 *   then sends that domain as Host, so only local names, IP addresses and the public address
 *   (AURA_PUBLIC_URL) are accepted.
 * The iPhone app and curl send no Origin, and they use the public address, localhost or an IP.
 * /api/health is left open: hosting platforms check it from inside their network under other names.
 */
const onlyThisApp: RequestHandler = (req, _res, next) => {
  if (req.path === '/api/health') return next()
  const host = req.headers.host?.toLowerCase()
  if (host && host !== publicHost && !isLocalHost(host)) throw new HttpError(403, 'Unknown host')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin
    const from = origin === undefined ? undefined : hostOf(origin)
    if (req.headers['sec-fetch-site'] === 'cross-site' || (origin !== undefined && from !== host && from !== publicHost)) {
      throw new HttpError(403, 'Requests from other websites are not allowed')
    }
  }
  next()
}

/**
 * No other site may show Aura inside a frame (where it could trick people into clicking "Start
 * over"), browsers must trust our Content-Type instead of guessing one, and links out of Aura
 * don't tell other sites which page they came from.
 */
const safetyHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
}

/** "http://localhost:5190" -> "localhost:5190"; null when it isn't a URL (sandboxed pages send "null"). */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase()
  } catch {
    return null
  }
}

/** localhost, an IP address (127.0.0.1, or the Mac's Wi-Fi address for a phone) or a Bonjour name like "my-mac.local". */
export function isLocalHost(host: string): boolean {
  let name: string
  try {
    name = new URL(`http://${host}`).hostname.replace(/^\[(.*)\]$/, '$1') // "[::1]" -> "::1"
  } catch {
    return false
  }
  return name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || net.isIP(name) !== 0
}

/** Every error becomes JSON { error: "..." } with a fitting status code. */
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error?.status === 'number' && error.status >= 400 && error.status < 600 ? error.status : 500
  if (status >= 500) console.error(error)
  if (res.headersSent) return // e.g. the live stream already started
  res.status(status).json({ error: errorMessage(error, status) })
}

function errorMessage(error: { type?: string; message?: string }, status: number): string {
  if (status >= 500) return 'Something went wrong on our side. Please try again.'
  if (error.type === 'entity.too.large') return 'That file is too big'
  if (error.type === 'entity.parse.failed') return 'The request body is not valid JSON'
  // Our own errors are written for people. Others can contain server paths (a missing static
  // file says "ENOENT: no such file or directory, stat '/Users/...'"), so they get a plain message.
  if (error instanceof HttpError) return error.message
  return status === 404 ? 'Not found' : 'Bad request'
}
