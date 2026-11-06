import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getBot, getWebhookHandler } from './bot'
import { validateMiniAppInitData, verifyTelegramLoginWidget } from './utils/telegram-auth'
import type { Bindings, BroadcastPayload, SendMessagePayload, SendPhotoPayload } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// Global error handler
app.onError((err, c) => {
  console.error('[TeleBot API Error]', err)
  return c.json(
    {
      ok: false,
      error: err.message || 'Internal Server Error',
    },
    500
  )
})

// Enable CORS for all API endpoints so any web app can fetch
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
  })
)

// Helper: Check API authentication (if API_KEY or ADMIN_SECRET is set in environment)
function checkAuth(c: any): boolean {
  const secret = c.env?.API_KEY || c.env?.ADMIN_SECRET
  if (!secret) return true // No key configured in env, allow access

  const headerKey = c.req.header('X-API-Key')
  const authHeader = c.req.header('Authorization')
  const bearerKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null
  const queryKey = c.req.query('api_key') || c.req.query('secret')

  return (
    headerKey === secret ||
    bearerKey === secret ||
    queryKey === secret
  )
}

// Helper: Ensure bot token is set
function getBotToken(c: any): string | null {
  return c.env?.TELEGRAM_BOT_TOKEN || null
}

// -------------------------------------------------------------
// 1. API Directory & Service Status (Root GET /)
// -------------------------------------------------------------
app.get('/', (c) => {
  const url = new URL(c.req.url)
  const origin = url.origin
  const hasToken = Boolean(c.env?.TELEGRAM_BOT_TOKEN)

  return c.json({
    ok: true,
    service: 'telebot-api',
    version: '1.0.0',
    platform: 'Cloudflare Workers (Edge)',
    configured: hasToken,
    domain: url.host,
    endpoints: {
      discovery: {
        'GET /': 'Directory of all available API endpoints',
        'GET /health': 'System health check and server time',
      },
      messaging: {
        'POST /api/send-message': {
          description: 'Send text message to a user or group',
          body: {
            chat_id: 'number | string (required)',
            text: 'string (required)',
            parse_mode: "'HTML' | 'Markdown' | 'MarkdownV2' (optional)",
            buttons: '[[{ text, url?, callback_data? }]] (optional inline keyboard)',
            disable_notification: 'boolean (optional)',
          },
        },
        'POST /api/send-photo': {
          description: 'Send photo with optional caption and buttons',
          body: {
            chat_id: 'number | string (required)',
            photo: 'string (URL or file_id, required)',
            caption: 'string (optional)',
            parse_mode: "'HTML' | 'Markdown' | 'MarkdownV2' (optional)",
            buttons: '[[{ text, url?, callback_data? }]] (optional)',
          },
        },
        'POST /api/broadcast': {
          description: 'Send a notification to multiple chat IDs concurrently',
          body: {
            chat_ids: 'Array<number | string> (required)',
            text: 'string (required)',
            parse_mode: 'string (optional)',
            buttons: 'Array (optional)',
          },
        },
      },
      auth: {
        'POST /api/auth/verify-widget': {
          description: 'Verify Telegram Login Widget authentication data',
          body: '{ id, first_name, username?, photo_url?, auth_date, hash }',
        },
        'POST /api/auth/validate-init-data': {
          description: 'Validate Telegram Mini App (TMA) raw initData string',
          body: '{ init_data: string, max_age_seconds?: number }',
        },
      },
      bot: {
        'GET /api/me': 'Get Telegram Bot information (username, ID, capabilities)',
        'GET /api/webhook': 'Get current Telegram webhook status',
        'POST /api/webhook/set': 'Set webhook URL (GET /set-webhook also supported)',
        'POST /api/webhook/delete': 'Delete webhook (GET /delete-webhook also supported)',
      },
      webhook: {
        'POST /webhook': 'Incoming webhook receiver for Telegram Bot events',
      },
    },
  })
})

// -------------------------------------------------------------
// 2. Health Check (GET /health)
// -------------------------------------------------------------
app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'telebot-api',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
})

// -------------------------------------------------------------
// 3. Bot Info (GET /api/me)
// -------------------------------------------------------------
app.get('/api/me', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  try {
    const bot = getBot(token)
    const me = await bot.api.getMe()
    return c.json({ ok: true, data: me })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to fetch bot info' }, 500)
  }
})

// -------------------------------------------------------------
// 4. Send Message (POST /api/send-message)
// -------------------------------------------------------------
app.post('/api/send-message', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  let body: SendMessagePayload
  try {
    body = await c.req.json<SendMessagePayload>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON request body' }, 400)
  }

  const { chat_id, text, parse_mode, buttons, disable_notification, disable_web_page_preview } = body

  if (!chat_id) {
    return c.json({ ok: false, error: 'Field "chat_id" is required' }, 400)
  }
  if (!text || typeof text !== 'string') {
    return c.json({ ok: false, error: 'Field "text" is required' }, 400)
  }

  try {
    const bot = getBot(token)
    const options: Record<string, any> = {}

    if (parse_mode) options.parse_mode = parse_mode
    if (disable_notification !== undefined) options.disable_notification = disable_notification
    if (disable_web_page_preview !== undefined) {
      options.link_preview_options = { is_disabled: disable_web_page_preview }
    }
    if (buttons && Array.isArray(buttons)) {
      options.reply_markup = { inline_keyboard: buttons }
    }

    const result = await bot.api.sendMessage(chat_id, text, options)
    return c.json({
      ok: true,
      message_id: result.message_id,
      chat_id: result.chat.id,
      date: result.date,
      result,
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error: error.message || 'Failed to send message',
        description: error.description || null,
        error_code: error.error_code || null,
      },
      error.error_code && error.error_code >= 400 && error.error_code < 500 ? error.error_code : 500
    )
  }
})

// -------------------------------------------------------------
// 5. Send Photo (POST /api/send-photo)
// -------------------------------------------------------------
app.post('/api/send-photo', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  let body: SendPhotoPayload
  try {
    body = await c.req.json<SendPhotoPayload>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON request body' }, 400)
  }

  const { chat_id, photo, caption, parse_mode, buttons, disable_notification } = body

  if (!chat_id) {
    return c.json({ ok: false, error: 'Field "chat_id" is required' }, 400)
  }
  if (!photo || typeof photo !== 'string') {
    return c.json({ ok: false, error: 'Field "photo" URL or file_id is required' }, 400)
  }

  try {
    const bot = getBot(token)
    const options: Record<string, any> = {}

    if (caption) options.caption = caption
    if (parse_mode) options.parse_mode = parse_mode
    if (disable_notification !== undefined) options.disable_notification = disable_notification
    if (buttons && Array.isArray(buttons)) {
      options.reply_markup = { inline_keyboard: buttons }
    }

    const result = await bot.api.sendPhoto(chat_id, photo, options)
    return c.json({
      ok: true,
      message_id: result.message_id,
      chat_id: result.chat.id,
      date: result.date,
      result,
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error: error.message || 'Failed to send photo',
        description: error.description || null,
        error_code: error.error_code || null,
      },
      error.error_code && error.error_code >= 400 && error.error_code < 500 ? error.error_code : 500
    )
  }
})

// -------------------------------------------------------------
// 6. Broadcast Message (POST /api/broadcast)
// -------------------------------------------------------------
app.post('/api/broadcast', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  let body: BroadcastPayload
  try {
    body = await c.req.json<BroadcastPayload>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON request body' }, 400)
  }

  const { chat_ids, text, parse_mode, buttons, disable_notification } = body

  if (!Array.isArray(chat_ids) || chat_ids.length === 0) {
    return c.json({ ok: false, error: 'Field "chat_ids" must be a non-empty array' }, 400)
  }
  if (!text || typeof text !== 'string') {
    return c.json({ ok: false, error: 'Field "text" is required' }, 400)
  }

  const bot = getBot(token)
  const options: Record<string, any> = {}
  if (parse_mode) options.parse_mode = parse_mode
  if (disable_notification !== undefined) options.disable_notification = disable_notification
  if (buttons && Array.isArray(buttons)) {
    options.reply_markup = { inline_keyboard: buttons }
  }

  // Concurrent delivery with status tracking
  const results = await Promise.allSettled(
    chat_ids.map(async (chatId) => {
      const res = await bot.api.sendMessage(chatId, text, options)
      return { chat_id: chatId, ok: true, message_id: res.message_id }
    })
  )

  let successCount = 0
  let failureCount = 0
  const deliveryReport = results.map((r, index) => {
    const chatId = chat_ids[index]
    if (r.status === 'fulfilled') {
      successCount++
      return r.value
    } else {
      failureCount++
      return {
        chat_id: chatId,
        ok: false,
        error: r.reason?.message || 'Delivery failed',
      }
    }
  })

  return c.json({
    ok: true,
    total: chat_ids.length,
    success_count: successCount,
    failure_count: failureCount,
    results: deliveryReport,
  })
})

// -------------------------------------------------------------
// 7. Verify Telegram Login Widget (POST /api/auth/verify-widget)
// -------------------------------------------------------------
app.post('/api/auth/verify-widget', async (c) => {
  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  let body: Record<string, any>
  try {
    body = await c.req.json<Record<string, any>>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON request body' }, 400)
  }

  const maxAge = typeof body.max_age_seconds === 'number' ? body.max_age_seconds : 86400
  const verification = await verifyTelegramLoginWidget(body, token, maxAge)

  if (!verification.valid) {
    return c.json(
      {
        ok: false,
        verified: false,
        error: verification.error || 'Verification failed',
      },
      401
    )
  }

  return c.json({
    ok: true,
    verified: true,
    user: verification.user,
  })
})

// -------------------------------------------------------------
// 8. Validate Telegram Mini App InitData (POST /api/auth/validate-init-data)
// -------------------------------------------------------------
app.post('/api/auth/validate-init-data', async (c) => {
  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  let body: { init_data?: string; max_age_seconds?: number }
  try {
    body = await c.req.json<{ init_data?: string; max_age_seconds?: number }>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON request body' }, 400)
  }

  if (!body.init_data) {
    return c.json({ ok: false, error: 'Field "init_data" string is required' }, 400)
  }

  const maxAge = typeof body.max_age_seconds === 'number' ? body.max_age_seconds : 86400
  const validation = await validateMiniAppInitData(body.init_data, token, maxAge)

  if (!validation.valid) {
    return c.json(
      {
        ok: false,
        verified: false,
        error: validation.error || 'Validation failed',
      },
      401
    )
  }

  return c.json({
    ok: true,
    verified: true,
    data: validation.data,
  })
})

// -------------------------------------------------------------
// 9. Webhook Management API
// -------------------------------------------------------------
const handleWebhookInfo = async (c: any) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  try {
    const bot = getBot(token)
    const [info, me] = await Promise.all([bot.api.getWebhookInfo(), bot.api.getMe()])
    return c.json({
      ok: true,
      bot: {
        id: me.id,
        first_name: me.first_name,
        username: me.username,
      },
      webhook_info: info,
    })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to fetch webhook info' }, 500)
  }
}

app.get('/api/webhook', handleWebhookInfo)
app.get('/api/webhook/info', handleWebhookInfo)
app.get('/webhook-info', handleWebhookInfo)

const handleSetWebhook = async (c: any) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  const currentUrl = new URL(c.req.url)
  let targetUrl: string | undefined
  let dropPending = false

  if (c.req.method === 'POST') {
    try {
      const body = await c.req.json().catch(() => ({}))
      targetUrl = body.url
      dropPending = Boolean(body.drop_pending_updates)
    } catch {
      // ignore
    }
  }

  const webhookUrl =
    targetUrl || c.req.query('url') || `${currentUrl.origin}/webhook`

  if (!dropPending) {
    dropPending = c.req.query('drop') === 'true'
  }

  const secretToken = c.env?.TELEGRAM_SECRET_TOKEN?.trim() || undefined
  const bot = getBot(token)

  try {
    const result = await bot.api.setWebhook(webhookUrl, {
      secret_token: secretToken,
      drop_pending_updates: dropPending,
      allowed_updates: ['message', 'callback_query', 'edited_message'],
    })

    const info = await bot.api.getWebhookInfo()

    return c.json({
      ok: true,
      message: 'Webhook registered successfully!',
      webhook_url: webhookUrl,
      result,
      info,
    })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to set webhook' }, 500)
  }
}

app.get('/api/webhook/set', handleSetWebhook)
app.post('/api/webhook/set', handleSetWebhook)
app.get('/set-webhook', handleSetWebhook)

const handleDeleteWebhook = async (c: any) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const token = getBotToken(c)
  if (!token) {
    return c.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400)
  }

  const dropPending = c.req.query('drop') === 'true'
  const bot = getBot(token)

  try {
    const result = await bot.api.deleteWebhook({
      drop_pending_updates: dropPending,
    })
    return c.json({
      ok: true,
      message: 'Webhook deleted successfully!',
      result,
    })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to delete webhook' }, 500)
  }
}

app.get('/api/webhook/delete', handleDeleteWebhook)
app.post('/api/webhook/delete', handleDeleteWebhook)
app.get('/delete-webhook', handleDeleteWebhook)

// -------------------------------------------------------------
// 10. Telegram Webhook Receiver (POST /webhook)
// -------------------------------------------------------------
app.post('/webhook', async (c) => {
  const token = getBotToken(c)
  if (!token) {
    return c.json(
      {
        ok: false,
        error:
          'TELEGRAM_BOT_TOKEN is not set. Please set it using "wrangler secret put TELEGRAM_BOT_TOKEN" or in .dev.vars.',
      },
      500
    )
  }

  const secretToken = c.env?.TELEGRAM_SECRET_TOKEN
  const handler = getWebhookHandler(token, secretToken)
  return handler(c)
})

export default app
