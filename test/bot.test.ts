import { describe, expect, it } from 'bun:test'
import app from '../src/index'
import { createBot } from '../src/bot'
import { validateMiniAppInitData, verifyTelegramLoginWidget } from '../src/utils/telegram-auth'

const mockEnv = {
  TELEGRAM_BOT_TOKEN: 'mock_test_token_for_unit_tests',
}

describe('TeleBot API Worker', () => {
  it('GET / should return JSON API directory', async () => {
    const res = await app.request('/', {}, mockEnv)
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.ok).toBe(true)
    expect(data.service).toBe('telebot-api')
    expect(data.endpoints).toBeDefined()
    expect(data.endpoints.messaging['POST /api/send-message']).toBeDefined()
    expect(data.endpoints.auth['POST /api/auth/verify-widget']).toBeDefined()
  })

  it('GET /health should return 200 healthy status', async () => {
    const res = await app.request('/health', {}, mockEnv)
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.ok).toBe(true)
    expect(data.status).toBe('healthy')
  })

  it('POST /api/send-message should validate required fields', async () => {
    // Missing body
    const res1 = await app.request(
      '/api/send-message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      mockEnv
    )
    expect(res1.status).toBe(400)

    // Missing text
    const res2 = await app.request(
      '/api/send-message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: 12345 }),
      },
      mockEnv
    )
    expect(res2.status).toBe(400)
    const data2 = (await res2.json()) as any
    expect(data2.error).toContain('text')
  })

  it('POST /api/broadcast should validate chat_ids array', async () => {
    const res = await app.request(
      '/api/broadcast',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_ids: [], text: 'Hello' }),
      },
      mockEnv
    )
    expect(res.status).toBe(400)
  })

  it('POST /api/auth/validate-init-data should reject invalid hash', async () => {
    const res = await app.request(
      '/api/auth/validate-init-data',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          init_data: 'query_id=test&user=%7B%22id%22%3A123%7D&auth_date=1700000000&hash=invalidhash123',
        }),
      },
      mockEnv
    )
    expect(res.status).toBe(401)
    const data = (await res.json()) as any
    expect(data.verified).toBe(false)
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

  it('POST /api/subscribers should validate required chat_id', async () => {
    const res = await app.request(
      '/api/subscribers',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'john' }),
      },
      mockEnv
    )
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toContain('chat_id')
  })

  it('GET / should include subscribers directory', async () => {
    const res = await app.request('/', {}, mockEnv)
    const data = (await res.json()) as any
    expect(data.endpoints.subscribers).toBeDefined()
    expect(data.endpoints.subscribers['GET /api/subscribers']).toBeDefined()
  })
})
