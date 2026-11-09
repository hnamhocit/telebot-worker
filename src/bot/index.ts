import { Bot, webhookCallback } from 'grammy'
import { registerBotHandlers } from './commands'
import type { Bindings } from '../types'

let cachedBot: Bot | null = null
let cachedHandler: ((c: any) => Promise<Response>) | null = null
let cachedToken: string | null = null
let cachedSecret: string | null = null

/**
 * Creates and initializes a new grammY Bot instance with registered handlers.
 */
export function createBot(token: string, env?: Bindings): Bot {
  const bot = new Bot(token)

  // Register command handlers and middlewares
  registerBotHandlers(bot, env)

  // Global error handler
  bot.catch((err) => {
    const ctx = err.ctx
    console.error(`[TeleBot] Error handling update ${ctx.update.update_id}:`, err.error)
  })

  return bot
}

/**
 * Retrieves a cached Bot instance or creates a new one if the token changes.
 */
export function getBot(token: string, env?: Bindings): Bot {
  if (cachedBot && cachedToken === token) {
    return cachedBot
  }
  cachedBot = createBot(token, env)
  cachedToken = token
  return cachedBot
}

/**
 * Returns a cached Hono webhook handler function for the given token and optional secret.
 */
export function getWebhookHandler(token: string, secretToken?: string, env?: Bindings) {
  const normalizedSecret = secretToken?.trim() || null

  if (
    cachedBot &&
    cachedHandler &&
    cachedToken === token &&
    cachedSecret === normalizedSecret
  ) {
    return cachedHandler
  }

  const bot = getBot(token, env)
  const handler = webhookCallback(bot, 'hono', {
    secretToken: normalizedSecret || undefined,
  })

  cachedHandler = handler
  cachedSecret = normalizedSecret
  return cachedHandler
}
