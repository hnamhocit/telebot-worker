import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import type { Bindings, SendMessagePayload, BroadcastPayload } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// Auth Middleware
const auth = async (c: any, next: any) => {
  if (c.req.header('X-Internal-Secret') !== c.env.INTERNAL_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}

// Webhook
app.post('/webhook', async (c) => {
  if (c.req.header('X-Telegram-Bot-Api-Secret-Token') !== c.env.TELEGRAM_SECRET_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const body = await c.req.json()
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)

  if (body.message?.text?.startsWith('/start')) {
    const chat = body.message.chat
    await supabase.from('telebot_subscribers').upsert({
      chat_id: chat.id,
      username: chat.username,
      status: 'active',
      tags: ['all']
    })
    return c.json({ ok: true })
  }
  
  if (body.message?.text === '/stop') {
    await supabase.from('telebot_subscribers').update({ status: 'inactive' }).eq('chat_id', body.message.chat.id)
    return c.json({ ok: true })
  }

  return c.json({ ok: true })
})

// Notify APIs
app.post('/api/notify/direct', auth, async (c) => {
  const { userId, chatId, text, parseMode } = await c.req.json<SendMessagePayload>()
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  
  let targetChatId = chatId
  if (userId) {
    const { data } = await supabase.from('telebot_subscribers').select('chat_id').eq('user_id', userId).eq('status', 'active').single()
    targetChatId = data?.chat_id
  }

  if (!targetChatId) return c.json({ success: false, error: 'Chat not found' }, 404)

  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: targetChatId, text, parse_mode: parseMode })
  })
  return c.json({ success: res.ok })
})

app.post('/api/notify/broadcast', auth, async (c) => {
  const { tag, text, parseMode } = await c.req.json<BroadcastPayload>()
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  
  let query = supabase.from('telebot_subscribers').select('chat_id').eq('status', 'active')
  if (tag) query = query.contains('tags', [tag])
  
  const { data: subscribers } = await query
  const results = await Promise.allSettled((subscribers || []).map(s => 
    fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: s.chat_id, text, parse_mode: parseMode })
    })
  ))

  return c.json({ total: subscribers?.length, sent: results.filter(r => r.status === 'fulfilled').length, failed: results.filter(r => r.status === 'rejected').length })
})

export default app
