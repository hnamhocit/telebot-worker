import { describe, expect, it } from 'bun:test'
import { app } from '../src/index'
import { createBot } from '../src/bot'
import { validateMiniAppInitData, verifyTelegramLoginWidget } from '../src/utils/telegram-auth'

const allow = { limit: async () => ({ success: true }) }
const mockEnv = {
  TELEGRAM_BOT_TOKEN: 'mock-telegram-token',
  TELEBOT_APP_ID: 'test-app',
  INTERNAL_SECRET: 'mock-internal-secret',
  TELEBOT_DIRECT_LIMIT: allow,
  TELEBOT_BROADCAST_LIMIT: allow,
}

describe('TeleBot API Worker', () => {
  it('serves the health endpoint', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'healthy' })
  })

  it('requires an internal credential', async () => {
    const res = await app.request('/api/notify/direct', { method: 'POST' }, mockEnv)
    expect(res.status).toBe(401)
  })

  it('validates direct notify input before accessing Supabase', async () => {
    const res = await app.request('/api/notify/direct', {
      method: 'POST',
      headers: { 'X-Internal-Secret': mockEnv.INTERNAL_SECRET },
      body: JSON.stringify({ chatId: 123 }),
    }, mockEnv)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'INVALID_MESSAGE' })
  })

  it('keys broadcast quota by the configured app and returns Retry-After', async () => {
    const res = await app.request('/api/notify/broadcast', {
      method: 'POST',
      headers: { 'X-Internal-Secret': mockEnv.INTERNAL_SECRET },
    }, {
      ...mockEnv,
      TELEBOT_BROADCAST_LIMIT: { async limit({ key }: { key: string }) {
        expect(key).toBe(mockEnv.TELEBOT_APP_ID)
        return { success: false }
      } },
    })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })

  it('treats Telegram rate limits as 429 and keeps subscriber lookup app-scoped', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'supabase.example.test') {
        expect(url.searchParams.get('app_id')).toBe('eq.test-app')
        expect(url.searchParams.get('chat_id')).toBe('eq.123')
        return Response.json([{ chat_id: 123 }])
      }
      expect(url.hostname).toBe('api.telegram.org')
      return Response.json({ ok: false, parameters: { retry_after: 17 } }, { status: 429 })
    }) as typeof fetch
    try {
      const res = await app.request('/api/notify/direct', {
        method: 'POST',
        headers: { 'X-Internal-Secret': mockEnv.INTERNAL_SECRET },
        body: JSON.stringify({ chatId: 123, text: 'hello' }),
      }, { ...mockEnv, SUPABASE_URL: 'https://supabase.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key' })
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('17')
      expect(await res.json()).toEqual({ error: 'TELEGRAM_RATE_LIMITED' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('telegram-auth: verifyTelegramLoginWidget validates correctly', async () => {
    const botToken = 'mock_test_token_for_unit_tests'
    
    const fakeData = {
      id: 123456,
      first_name: 'John',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'fakehash',
    }
    const result = await verifyTelegramLoginWidget(fakeData, botToken)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('verification failed')
  })

  it('telegram-auth: validateMiniAppInitData handles invalid inputs gracefully', async () => {
    const botToken = 'mock_test_token_for_unit_tests'
    const resEmpty = await validateMiniAppInitData('', botToken)
    expect(resEmpty.valid).toBe(false)

    const resNoHash = await validateMiniAppInitData('user=123&auth_date=123', botToken)
    expect(resNoHash.valid).toBe(false)
    expect(resNoHash.error).toContain('Missing hash')
  })

  it('createBot initializes bot instance without errors', () => {
    const bot = createBot('mock_test_token_for_unit_tests')
    expect(bot).toBeDefined()
    expect(typeof bot.command).toBe('function')
  })

})
