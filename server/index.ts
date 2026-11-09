/**
 * Starts Aura: serves the app, then starts the simulation so every world comes alive.
 */
import { providerInfo } from './ai/llm.ts'
import { createApp, isLocalHost } from './app.ts'
import { describeSignIn, warnAboutSignInSetup } from './auth/routes.ts'
import { authEnabled, config } from './config.ts'
import { cleanUpAccounts, closeAccounts } from './db/accounts.ts'
import { closeAllWorlds } from './db/index.ts'
import * as sim from './sim/index.ts'

// A public address without sign-in would hand one shared world to anyone who visits.
if (!authEnabled && process.env.AURA_PUBLIC_URL && !isLocalHost(new URL(config.publicUrl).host)) {
  console.error('AURA_PUBLIC_URL is a public address, but Google sign-in is not set up. Set GOOGLE_CLIENT_ID and '
    + 'GOOGLE_CLIENT_SECRET (see DEPLOY.md), or remove AURA_PUBLIC_URL to run Aura locally.')
  process.exit(1)
}
warnAboutSignInSetup()
if (authEnabled) cleanUpAccounts()

const server = createApp().listen(config.port, config.host, (error) => {
  if (error) throw error
  console.log(`Aura server on http://${config.host}:${config.port}`)
  console.log(`AI: ${providerInfo().detail}`)
  console.log(`Sign-in: ${describeSignIn()}`)
  sim.start()
})

// Hosting platforms stop the server with SIGTERM on every deploy (and `node --watch` on every
// save): close the databases cleanly before exiting.
process.on('SIGTERM', () => {
  sim.stop()
  server.close()
  closeAllWorlds()
  closeAccounts()
  process.exit(0)
})
