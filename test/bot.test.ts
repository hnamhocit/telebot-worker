import { describe, expect, it } from 'bun:test'
import app from '../src/index'
import { createBot } from '../src/bot'

describe('TeleBot Cloudflare Worker', () => {
  it('GET / should return JSON status by default', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.service).toBe('telebot')
  })

  it('GET / with Accept: text/html should return HTML UI', async () => {
    const res = await app.request('/', {
      headers: {
        Accept: 'text/html',
      },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('TeleBot Worker')
    expect(html).toContain('Cloudflare Workers')
  })

  it('GET /health should return 200 and healthy status', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.status).toBe('healthy')
  })

  it('POST /webhook without token should return 500 error', async () => {
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.ok).toBe(false)
    expect(data.error).toContain('TELEGRAM_BOT_TOKEN is not set')
  })

  it('GET /set-webhook without token should return 400 error', async () => {
    const res = await app.request('/set-webhook')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.ok).toBe(false)
    expect(data.error).toContain('TELEGRAM_BOT_TOKEN is not configured')
  })

  it('GET /webhook-info without token should return 400 error', async () => {
    const res = await app.request('/webhook-info')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.ok).toBe(false)
  })

  it('createBot initializes bot instance without errors', () => {
    const bot = createBot('123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ')
    expect(bot).toBeDefined()
    expect(typeof bot.command).toBe('function')
    expect(typeof bot.handleUpdate).toBe('function')
  })
})
