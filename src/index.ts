import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getBot, getWebhookHandler } from './bot'
import { validateMiniAppInitData, verifyTelegramLoginWidget } from './utils/telegram-auth'
import { SubscriberService } from './services/subscriber.service'
import type {
  Bindings,
  BroadcastPayload,
  SendMessagePayload,
  SendPhotoPayload,
  UpsertSubscriberPayload,
} from './types'

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
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
  const hasToken = Boolean(c.env?.TELEGRAM_BOT_TOKEN)

  return c.json({
    ok: true,
    service: 'telebot-api',
    name: 'TeleBot Cloudflare Worker & Subscribers API',
    version: '2.0.0',
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
          description:
            'Send broadcast notification. If "chat_ids" is omitted, automatically broadcasts to all active subscribers in Supabase!',
          body: {
            chat_ids: 'Array<number | string> (optional, defaults to active subscribers in DB)',
            tags: 'Array<string> (optional, filter subscribers by tag when chat_ids omitted)',
            status: 'string (optional, default: "active")',
            text: 'string (required)',
            parse_mode: "'HTML' | 'Markdown' | 'MarkdownV2' (optional)",
            buttons: '[[{ text, url?, callback_data? }]] (optional)',
            disable_notification: 'boolean (optional)',
          },
        },
      },
      subscribers: {
        'GET /api/subscribers': {
          description: 'List subscribers with filters and pagination from Supabase',
          query: {
            status: "'active' | 'unsubscribed' | 'blocked' | 'all' (optional)",
            tag: 'string (optional tag filter)',
            search: 'string (optional search by name, username, or email)',
            limit: 'number (optional, default 50, max 200)',
            offset: 'number (optional, default 0)',
          },
        },
        'POST /api/subscribers': {
          description: 'Create or upsert subscriber record in Supabase',
          body: {
            chat_id: 'number | string (required, PK)',
            email: 'string (optional, defaults to empty string)',
            user_id: 'uuid (optional, linked auth user)',
            username: 'string (optional)',
            first_name: 'string (optional)',
            last_name: 'string (optional)',
            status: "'active' | 'unsubscribed' | 'blocked' (optional, default active)",
            tags: 'string[] (optional, default ["default"])',
            metadata: 'jsonb object (optional)',
          },
        },
        'GET /api/subscribers/:chat_id': 'Get subscriber details by Telegram chat_id',
        'PUT /api/subscribers/:chat_id': 'Update subscriber details (PATCH also supported)',
        'DELETE /api/subscribers/:chat_id':
          'Unsubscribe subscriber (soft delete). Pass ?hard=true for permanent deletion.',
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
    docs: 'https://workers-hub.hnamhocit.workers.dev/workers/telebot/overview/',
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
    const bot = getBot(token, c.env)
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
    const bot = getBot(token, c.env)
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
    const bot = getBot(token, c.env)
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

  const { text, parse_mode, buttons, disable_notification } = body
  let targetChatIds = body.chat_ids

  // Nếu không truyền chat_ids: tự động truy vấn từ danh sách Subscribers trong Supabase!
  if (!targetChatIds || !Array.isArray(targetChatIds) || targetChatIds.length === 0) {
    try {
      targetChatIds = await SubscriberService.getActiveChatIds(c.env, {
        tags: body.tags,
        status: body.status || 'active',
      })
    } catch (err: any) {
      return c.json(
        { ok: false, error: `Failed to query subscribers from database: ${err.message}` },
        500
      )
    }

    if (!targetChatIds || targetChatIds.length === 0) {
      return c.json(
        {
          ok: false,
          error: 'No active subscribers found in database matching the criteria.',
          total: 0,
        },
        400
      )
    }
  }

  if (!text || typeof text !== 'string') {
    return c.json({ ok: false, error: 'Field "text" is required' }, 400)
  }

  const bot = getBot(token, c.env)
  const options: Record<string, any> = {}
  if (parse_mode) options.parse_mode = parse_mode
  if (disable_notification !== undefined) options.disable_notification = disable_notification
  if (buttons && Array.isArray(buttons)) {
    options.reply_markup = { inline_keyboard: buttons }
  }

  // Concurrent delivery with status tracking
  const results = await Promise.allSettled(
    targetChatIds.map(async (chatId) => {
      const res = await bot.api.sendMessage(chatId, text, options)
      return { chat_id: chatId, ok: true, message_id: res.message_id }
    })
  )

  let successCount = 0
  let failureCount = 0
  const deliveryReport = results.map((r, index) => {
    const chatId = targetChatIds[index]
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
    total: targetChatIds.length,
    success_count: successCount,
    failure_count: failureCount,
    source: body.chat_ids && body.chat_ids.length > 0 ? 'custom_payload' : 'supabase_subscribers',
    results: deliveryReport,
  })
})

// -------------------------------------------------------------
// 7. Subscribers Management API
// -------------------------------------------------------------
app.get('/api/subscribers', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const status = c.req.query('status')
  const tag = c.req.query('tag')
  const search = c.req.query('search')
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : 50
  const offset = c.req.query('offset') ? Number(c.req.query('offset')) : 0

  try {
    const result = await SubscriberService.listSubscribers(c.env, {
      status,
      tag,
      search,
      limit,
      offset,
    })
    return c.json({ ok: true, ...result })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500)
  }
})

app.post('/api/subscribers', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  let body: UpsertSubscriberPayload
  try {
    body = await c.req.json<UpsertSubscriberPayload>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON request body' }, 400)
  }

  if (!body.chat_id) {
    return c.json({ ok: false, error: 'Field "chat_id" is required' }, 400)
  }

  try {
    const subscriber = await SubscriberService.upsertSubscriber(c.env, body)
    return c.json({ ok: true, subscriber })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500)
  }
})

app.get('/api/subscribers/:chat_id', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const chatId = c.req.param('chat_id')
  try {
    const subscriber = await SubscriberService.getSubscriber(c.env, chatId)
    if (!subscriber) {
      return c.json({ ok: false, error: 'Subscriber not found' }, 404)
    }
    return c.json({ ok: true, subscriber })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500)
  }
})

const handleUpdateSubscriber = async (c: any) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const chatId = c.req.param('chat_id')
  let body: Partial<UpsertSubscriberPayload>
  try {
    body = await c.req.json<Partial<UpsertSubscriberPayload>>()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON request body' }, 400)
  }

  try {
    const subscriber = await SubscriberService.updateSubscriber(c.env, chatId, body)
    if (!subscriber) {
      return c.json({ ok: false, error: 'Subscriber not found' }, 404)
    }
    return c.json({ ok: true, subscriber })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500)
  }
}

app.put('/api/subscribers/:chat_id', handleUpdateSubscriber)
app.patch('/api/subscribers/:chat_id', handleUpdateSubscriber)

app.delete('/api/subscribers/:chat_id', async (c) => {
  if (!checkAuth(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid API key' }, 401)
  }

  const chatId = c.req.param('chat_id')
  const hard = c.req.query('hard') === 'true'

  try {
    await SubscriberService.deleteSubscriber(c.env, chatId, hard)
    return c.json({
      ok: true,
      message: hard ? 'Subscriber permanently deleted' : 'Subscriber unsubscribed',
    })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500)
  }
})

// -------------------------------------------------------------
// 8. Verify Telegram Login Widget (POST /api/auth/verify-widget)
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
// 9. Validate Telegram Mini App InitData (POST /api/auth/validate-init-data)
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
// 10. Webhook Management API
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
    const bot = getBot(token, c.env)
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
  const bot = getBot(token, c.env)

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
  const bot = getBot(token, c.env)

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
// 11. Telegram Webhook Receiver (POST /webhook)
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
  const handler = getWebhookHandler(token, secretToken, c.env)
  return handler(c)
})

export default app
