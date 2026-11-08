/**
 * Starts Aura: restores the AI model chosen in Settings, serves the app, then starts the
 * simulation so the world comes alive.
 */
import type { AiModel } from '../shared/types.ts'
import { providerInfo, setDefaultModel } from './ai/llm.ts'
import { createApp } from './app.ts'
import { config } from './config.ts'
import { getSetting } from './db/index.ts'
import * as sim from './sim/index.ts'

setDefaultModel(getSetting<AiModel>('model', 'opus'))

createApp().listen(config.port, config.host, (error) => {
  if (error) throw error
  console.log(`Aura server on http://${config.host}:${config.port}`)
  console.log(`AI: ${providerInfo().detail}`)
  sim.start()
})
