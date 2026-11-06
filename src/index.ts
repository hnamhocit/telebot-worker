import { Hono } from 'hono'
import { getBot, getWebhookHandler } from './bot'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// Middleware for error handling
app.onError((err, c) => {
  console.error('[Hono Server Error]', err)
  return c.json(
    {
      ok: false,
      error: err.message || 'Internal Server Error',
    },
    500
  )
})

// Check admin authentication if ADMIN_SECRET is defined
function isAuthorized(c: any): boolean {
  const adminSecret = c.env?.ADMIN_SECRET
  if (!adminSecret) return true // No admin secret configured, allow access

  const querySecret = c.req.query('secret')
  const authHeader = c.req.header('Authorization')
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null

  return querySecret === adminSecret || bearerToken === adminSecret
}

// 1. Root & Status Page
app.get('/', (c) => {
  const url = new URL(c.req.url)
  const host = url.host
  const isHtml = c.req.header('accept')?.includes('text/html')

  const botConfigured = Boolean(c.env?.TELEGRAM_BOT_TOKEN)

  if (isHtml) {
    return c.html(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TeleBot | Cloudflare Worker</title>
  <link rel="icon" href="https://telegram.org/favicon.ico">
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --primary: #38bdf8;
      --success: #22c55e;
      --warning: #f59e0b;
      --code-bg: #090d16;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .container {
      max-width: 680px;
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2.5rem;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .logo {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, #229ed9, #1976d2);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }
    h1 { font-size: 1.75rem; font-weight: 700; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 4px;
    }
    .badge.online { background: rgba(34, 197, 94, 0.15); color: var(--success); }
    .badge.warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    p { color: var(--muted); line-height: 1.6; margin-bottom: 1.25rem; }
    .section-title {
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--primary);
      margin: 1.5rem 0 0.75rem 0;
      font-weight: 700;
    }
    .endpoint-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .endpoint-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-family: monospace;
      font-size: 0.9rem;
    }
    .endpoint-item a {
      color: var(--primary);
      text-decoration: none;
    }
    .endpoint-item a:hover { text-decoration: underline; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0.65rem 1.25rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .btn-primary {
      background: #2563eb;
      color: white;
      border: none;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-outline {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-outline:hover { background: rgba(255,255,255,0.05); }
    .footer {
      margin-top: 2rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--border);
      font-size: 0.85rem;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer a { color: var(--primary); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">⚡</div>
      <div>
        <h1>TeleBot Worker</h1>
        ${
          botConfigured
            ? `<div class="badge online"><span class="dot"></span> Online & Sẵn sàng</div>`
            : `<div class="badge warning"><span class="dot"></span> Cần cấu hình TELEGRAM_BOT_TOKEN</div>`
        }
      </div>
    </div>

    <p>
      Telegram Bot API webhook serverless chạy trực tiếp trên <strong>Cloudflare Workers</strong> (V8 Isolate Edge).
    </p>

    <div class="section-title">Endpoints Điều Khiển</div>
    <div class="endpoint-list">
      <div class="endpoint-item">
        <span><code>POST</code> /webhook</span>
        <span style="color: var(--muted)">Telegram Webhook</span>
      </div>
      <div class="endpoint-item">
        <a href="/set-webhook" target="_blank"><code>GET</code> /set-webhook</a>
        <span style="color: var(--muted)">Tự động đăng ký Webhook</span>
      </div>
      <div class="endpoint-item">
        <a href="/webhook-info" target="_blank"><code>GET</code> /webhook-info</a>
        <span style="color: var(--muted)">Xem trạng thái Webhook</span>
      </div>
      <div class="endpoint-item">
        <a href="/health" target="_blank"><code>GET</code> /health</a>
        <span style="color: var(--muted)">Health Check</span>
      </div>
    </div>

    <div class="actions">
      <a href="/webhook-info" class="btn btn-primary">🔍 Kiểm Tra Webhook Info</a>
      <a href="/set-webhook" class="btn btn-outline">🚀 Đặt Lại Webhook</a>
      <a href="https://github.com/hnamhocit" target="_blank" class="btn btn-outline">👨‍💻 GitHub @hnamhocit</a>
    </div>

    <div class="footer">
      <span>Domain: <strong>${host}</strong></span>
      <span>Phát triển bởi <a href="https://github.com/hnamhocit" target="_blank">Nguyễn Hoàng Nam</a></span>
    </div>
  </div>
</body>
</html>`)
  }

  return c.json({
    ok: true,
    service: 'telebot',
    status: botConfigured ? 'running' : 'unconfigured',
    platform: 'Cloudflare Workers (Edge)',
    domain: host,
    botConfigured,
    endpoints: {
      webhook: `https://${host}/webhook`,
      set_webhook: `https://${host}/set-webhook`,
      webhook_info: `https://${host}/webhook-info`,
      delete_webhook: `https://${host}/delete-webhook`,
      health: `https://${host}/health`,
    },
  })
})

// 2. Health check
app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'telebot',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
})

// 3. Telegram Webhook Handler (POST /webhook)
app.post('/webhook', async (c) => {
  const token = c.env?.TELEGRAM_BOT_TOKEN
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

// 4. Set Webhook API (GET /set-webhook)
app.get('/set-webhook', async (c) => {
  if (!isAuthorized(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid admin secret' }, 401)
  }

  const token = c.env?.TELEGRAM_BOT_TOKEN
  if (!token) {
    return c.json(
      {
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured.',
      },
      400
    )
  }

  const bot = getBot(token)
  const currentUrl = new URL(c.req.url)
  const targetWebhookUrl =
    c.req.query('url') || `https://${currentUrl.host}/webhook`
  const dropPending = c.req.query('drop') === 'true'
  const secretToken = c.env?.TELEGRAM_SECRET_TOKEN?.trim() || undefined

  try {
    const result = await bot.api.setWebhook(targetWebhookUrl, {
      secret_token: secretToken,
      drop_pending_updates: dropPending,
      allowed_updates: ['message', 'callback_query', 'edited_message'],
    })

    const webhookInfo = await bot.api.getWebhookInfo()

    return c.json({
      ok: true,
      message: 'Webhook registered successfully!',
      webhook_url: targetWebhookUrl,
      result,
      info: webhookInfo,
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error: error.message || 'Failed to set webhook',
        details: error,
      },
      500
    )
  }
})

// 5. Get Webhook Info (GET /webhook-info)
app.get('/webhook-info', async (c) => {
  if (!isAuthorized(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid admin secret' }, 401)
  }

  const token = c.env?.TELEGRAM_BOT_TOKEN
  if (!token) {
    return c.json(
      {
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured.',
      },
      400
    )
  }

  const bot = getBot(token)
  try {
    const info = await bot.api.getWebhookInfo()
    const botUser = await bot.api.getMe()
    return c.json({
      ok: true,
      bot: {
        id: botUser.id,
        first_name: botUser.first_name,
        username: botUser.username,
      },
      webhook_info: info,
    })
  } catch (error: any) {
    return c.json(
      {
        ok: false,
        error: error.message || 'Failed to get webhook info',
        details: error,
      },
      500
    )
  }
})

// 6. Delete Webhook (GET /delete-webhook)
app.get('/delete-webhook', async (c) => {
  if (!isAuthorized(c)) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid admin secret' }, 401)
  }

  const token = c.env?.TELEGRAM_BOT_TOKEN
  if (!token) {
    return c.json(
      {
        ok: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured.',
      },
      400
    )
  }

  const bot = getBot(token)
  const dropPending = c.req.query('drop') === 'true'

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
    return c.json(
      {
        ok: false,
        error: error.message || 'Failed to delete webhook',
        details: error,
      },
      500
    )
  }
})

export default app
