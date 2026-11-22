import { Hono } from 'hono'
import { getSupabase } from './utils/supabase'
import type { Bindings, NotificationJob } from './types'

const app = new Hono<{ Bindings: Bindings }>()
const validChat = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value !== 0

function messageFrom(body: unknown): Omit<NotificationJob, "chatId"> | null {
  if (!body || typeof body !== 'object') return null
  const { text, parseMode } = body as Record<string, unknown>
  if (typeof text !== 'string' || !text.trim() || [...text].length > 4096) return null
  if (parseMode !== undefined && parseMode !== 'HTML' && parseMode !== 'MarkdownV2') return null
  return { text, parseMode }
}

async function send(env: Bindings, job: NotificationJob) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: job.chatId, text: job.text, parse_mode: job.parseMode }),
  })
  const result = await response.json<{ ok?: boolean; parameters?: { retry_after?: number } }>().catch(() => null)
  return { ok: response.ok && result?.ok === true, status: response.status, retryAfter: result?.parameters?.retry_after }
}

app.get('/', (c) => c.json({ status: 'ok', service: 'telebot' }))
app.get('/health', (c) => c.json({ status: 'healthy' }))

app.use('/api/notify/*', async (c, next) => {
  const { INTERNAL_SECRET, TELEBOT_APP_ID, TELEGRAM_BOT_TOKEN } = c.env
  if (!INTERNAL_SECRET || !TELEBOT_APP_ID || !TELEGRAM_BOT_TOKEN) return c.json({ error: 'AUTH_UNAVAILABLE' }, 503)
  if (c.req.header('X-Internal-Secret') !== INTERNAL_SECRET) return c.json({ error: 'UNAUTHORIZED' }, 401)
  const limiter = c.req.path === '/api/notify/broadcast' ? c.env.TELEBOT_BROADCAST_LIMIT : c.env.TELEBOT_DIRECT_LIMIT
  if (!(await limiter.limit({ key: TELEBOT_APP_ID })).success) {
    c.header('Retry-After', '60')
    return c.json({ error: 'RATE_LIMITED' }, 429)
  }
  await next()
})

app.post('/webhook', async (c) => {
  const { TELEGRAM_SECRET_TOKEN, TELEBOT_APP_ID } = c.env
  if (!TELEGRAM_SECRET_TOKEN || !TELEBOT_APP_ID) return c.json({ error: 'AUTH_UNAVAILABLE' }, 503)
  if (c.req.header('X-Telegram-Bot-Api-Secret-Token') !== TELEGRAM_SECRET_TOKEN) {
    return c.json({ error: 'UNAUTHORIZED' }, 401)
  }
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'INVALID_UPDATE' }, 400)
  const chat = body.message?.chat
  const text: unknown = body.message?.text
  if (!validChat(chat?.id) || typeof text !== 'string') return c.json({ ok: true })
  const command = text.split(/\s/, 1)[0].split('@', 1)[0]
  if (command !== '/start' && command !== '/stop') return c.json({ ok: true })

  const subscribers = getSupabase(c.env).from('telebot_subscribers')
  const { error } = command === '/start'
    ? await subscribers.upsert({
      app_id: TELEBOT_APP_ID, chat_id: chat.id, username: chat.username, status: 'active',
    }, { onConflict: 'app_id,chat_id', defaultToNull: false })
    : await subscribers.update({ status: 'inactive' }).eq('app_id', TELEBOT_APP_ID).eq('chat_id', chat.id)
  if (error) return c.json({ error: 'SUBSCRIBER_WRITE_FAILED' }, 503)
  return c.json({ ok: true })
})

app.post('/api/notify/direct', async (c) => {
  const body = await c.req.json().catch(() => null)
  const message = messageFrom(body)
  const { userId, chatId } = body ?? {}
  if (!message || (chatId !== undefined && !validChat(chatId)) ||
      (userId !== undefined && (typeof userId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId))) ||
      (chatId === undefined) === (userId === undefined)) {
    return c.json({ error: 'INVALID_MESSAGE' }, 400)
  }

  const subscribers = getSupabase(c.env).from('telebot_subscribers').select('chat_id')
    .eq('app_id', c.env.TELEBOT_APP_ID).eq('status', 'active')
  const { data, error } = await (userId ? subscribers.eq('user_id', userId) : subscribers.eq('chat_id', chatId))
    .limit(2)
  if (error) return c.json({ error: 'SUBSCRIBER_LOOKUP_FAILED' }, 503)
  if (!data?.length) return c.json({ error: 'CHAT_NOT_FOUND' }, 404)
  if (data.length > 1) return c.json({ error: 'AMBIGUOUS_CHAT' }, 409)

  const result = await send(c.env, { chatId: data[0].chat_id, ...message }).catch(() => null)
  if (result?.status === 429) {
    c.header('Retry-After', String(result.retryAfter ?? 60))
    return c.json({ error: 'TELEGRAM_RATE_LIMITED' }, 429)
  }
  if (!result?.ok) return c.json({ error: 'TELEGRAM_SEND_FAILED' }, 502)
  return c.json({ success: true })
})

app.post('/api/notify/broadcast', async (c) => {
  const body = await c.req.json().catch(() => null)
  const message = messageFrom(body)
  const tag = body?.tag
  if (!message || (tag !== undefined && (typeof tag !== 'string' || !tag || tag.length > 128))) {
    return c.json({ error: 'INVALID_MESSAGE' }, 400)
  }

  const appId = c.env.TELEBOT_APP_ID
  const query = getSupabase(c.env).from('telebot_subscribers').select('chat_id', { count: 'exact' })
    .eq('app_id', appId).eq('status', 'active').order('chat_id').limit(100)
  const { data, count, error } = await (tag ? query.contains('tags', [tag]) : query)
  if (error || count === null || !data) return c.json({ error: 'SUBSCRIBER_LOOKUP_FAILED' }, 503)
  if (count > 100) return c.json({ error: 'BROADCAST_RECIPIENT_LIMIT' }, 422)
  if (data.length) {
    const quota = await c.env.TELEBOT_RECIPIENT_LIMIT.limit({ key: appId, delta: data.length })
    if (!quota.success) {
      c.header('Retry-After', '60')
      return c.json({ error: 'RATE_LIMITED' }, 429)
    }
    await c.env.NOTIFICATIONS.sendBatch(data.map(({ chat_id }) => ({
      body: { chatId: chat_id, ...message },
    })))
  }
  return c.json({ accepted: data.length }, 202)
})

app.onError((_error, c) => c.json({ error: 'INTERNAL_ERROR' }, 500))

export { app }

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<NotificationJob>, env: Bindings) {
    for (const item of batch.messages) {
      const result = await send(env, item.body).catch(() => null)
      if (!result || result.status === 429 || result.status >= 500) {
        item.retry({ delaySeconds: Math.max(1, Math.ceil(result?.retryAfter ?? 30)) })
      } else {
        if (!result.ok) console.warn('Telegram rejected queued notification', result.status)
        item.ack()
      }
    }
  },
}
