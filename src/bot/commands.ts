import { Bot, InlineKeyboard } from 'grammy'
import { SubscriberService } from '../services/subscriber.service'
import type { Bindings } from '../types'

export function registerBotHandlers(bot: Bot, env?: Bindings) {
  // Command: /start
  bot.command('start', async (ctx) => {
    const user = ctx.from
    const chat = ctx.chat
    const name = user ? (user.first_name || user.username || 'bạn') : 'bạn'

    // Tự động lưu/cập nhật thông tin Subscriber vào Supabase
    if (user && chat) {
      try {
        await SubscriberService.upsertSubscriber(env, {
          chat_id: chat.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          status: 'active',
          tags: ['telegram', 'default'],
          metadata: {
            language_code: user.language_code,
            is_premium: user.is_premium,
            chat_type: chat.type,
          },
        })
      } catch (err) {
        console.error('[TeleBot /start] Không thể tự động lưu subscriber:', err)
      }
    }
    
    const keyboard = new InlineKeyboard()
      .text('⚡ Kiểm tra Ping', 'ping_btn')
      .text('🆔 Thông tin ID', 'id_btn')
      .row()
      .text('🔔 Đăng ký tin', 'sub_btn')
      .text('🔕 Hủy nhận tin', 'unsub_btn')
      .row()
      .text('📖 Hướng dẫn sử dụng', 'help_btn')
      .text('ℹ️ Giới thiệu', 'info_btn')
      .row()
      .url('🌐 GitHub Tác Giả', 'https://github.com/hnamhocit')

    const welcomeText = 
      `👋 *Xin chào ${escapeMarkdown(name)}!*\n\n` +
      `🤖 Chào mừng bạn đến với *TeleBot* \\- Telegram Bot chạy trên nền tảng *Cloudflare Workers* (Edge Serverless ⚡) kết nối dữ liệu *Supabase Database*.\n\n` +
      `⚡ *Các tính năng nổi bật:*\n` +
      `• Quản lý Subscribers tự động trên Supabase Database\n` +
      `• Gửi tin nhắn & thông báo Broadcast tức thời qua Edge Network\n` +
      `• Phản hồi siêu tốc với mạng lưới Cloudflare toàn cầu\n` +
      `• Hỗ trợ Webhook bảo mật cao\n\n` +
      `Chọn một trong các nút bên dưới hoặc gõ /help để bắt đầu!`

    await ctx.reply(welcomeText, {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard,
    })
  })

  // Command: /subscribe
  bot.command('subscribe', async (ctx) => {
    const user = ctx.from
    const chat = ctx.chat
    if (!chat) return

    try {
      await SubscriberService.upsertSubscriber(env, {
        chat_id: chat.id,
        username: user?.username,
        first_name: user?.first_name,
        last_name: user?.last_name,
        status: 'active',
        tags: ['telegram', 'manual_subscribe'],
      })
      await ctx.reply(
        `✅ *Đăng ký nhận thông báo thành công\\!*\n\nChat ID của bạn (\`${chat.id}\`) đã được kích hoạt nhận tin tự động\\.`,
        { parse_mode: 'MarkdownV2' }
      )
    } catch (err: any) {
      await ctx.reply(`❌ Lỗi khi đăng ký: ${err.message}`)
    }
  })

  // Command: /unsubscribe hoặc /stop
  bot.command(['unsubscribe', 'stop'], async (ctx) => {
    const chat = ctx.chat
    if (!chat) return

    try {
      await SubscriberService.deleteSubscriber(env, chat.id, false)
      await ctx.reply(
        `🔕 *Đã hủy đăng ký nhận thông báo\\!*\n\nBạn sẽ không còn nhận tin nhắn Broadcast tự động nữa\\. Gõ /subscribe bất cứ lúc nào để đăng ký lại\\.`,
        { parse_mode: 'MarkdownV2' }
      )
    } catch (err: any) {
      await ctx.reply(`❌ Lỗi khi hủy đăng ký: ${err.message}`)
    }
  })

  // Command: /help
  bot.command('help', async (ctx) => {
    const helpText =
      `📖 *Danh Sách Lệnh TeleBot:*\n\n` +
      `• /start \\- Khởi động bot & mở menu chính\n` +
      `• /subscribe \\- Đăng ký nhận thông báo hệ thống\n` +
      `• /unsubscribe \\- Hủy nhận thông báo (hoặc /stop)\n` +
      `• /help \\- Xem danh sách hướng dẫn này\n` +
      `• /ping \\- Kiểm tra độ trễ và thời gian máy chủ Edge\n` +
      `• /id \\- Xem User ID, Chat ID và thông tin tài khoản\n` +
      `• /echo <tin nhắn> \\- Lặp lại nội dung bạn gửi\n` +
      `• /info \\- Thông tin hạ tầng và công nghệ bot\n\n` +
      `💡 *Mẹo:* Bạn có thể bấm trực tiếp vào các nút tương tác bên dưới tin nhắn bất kỳ lúc nào!`

    await ctx.reply(helpText, { parse_mode: 'MarkdownV2' })
  })

  // Command: /ping
  bot.command('ping', async (ctx) => {
    const start = Date.now()
    const msgDate = (ctx.message?.date ?? Math.floor(start / 1000)) * 1000
    const latency = Math.max(0, start - msgDate)
    const nowIso = new Date().toISOString()

    const pingText =
      `🏓 *Pong!*\n\n` +
      `⏱️ *Độ trễ:* \`~${latency} ms\`\n` +
      `🌍 *Runtime:* Cloudflare Worker Edge\n` +
      `🕒 *Server Time:* \`${escapeMarkdown(nowIso)}\``

    await ctx.reply(pingText, { parse_mode: 'MarkdownV2' })
  })

  // Command: /id
  bot.command('id', async (ctx) => {
    const user = ctx.from
    const chat = ctx.chat
    const messageId = ctx.message?.message_id

    let subStatus = 'Chưa xác định'
    let subTags = '—'
    if (chat) {
      try {
        const sub = await SubscriberService.getSubscriber(env, chat.id)
        if (sub) {
          subStatus = sub.status === 'active' ? '🟢 Đang hoạt động (Active)' : '🔴 ' + sub.status
          subTags = sub.tags && sub.tags.length > 0 ? sub.tags.join(', ') : 'default'
        }
      } catch {}
    }

    const idText =
      `🆔 *Thông Tin Người Dùng & Chat:*\n\n` +
      `👤 *Họ & Tên:* ${escapeMarkdown(user?.first_name || 'N/A')} ${escapeMarkdown(user?.last_name || '')}\n` +
      `🏷️ *Username:* ${user?.username ? `@${escapeMarkdown(user.username)}` : '_Không có_'}\n` +
      `🆔 *User ID:* \`${user?.id || 'N/A'}\`\n` +
      `💬 *Chat ID:* \`${chat?.id || 'N/A'}\`\n` +
      `📱 *Loại Chat:* \`${chat?.type || 'private'}\`\n` +
      `🔔 *Trạng thái Subscribe:* ${escapeMarkdown(subStatus)}\n` +
      `🏷️ *Tags:* \`${escapeMarkdown(subTags)}\`\n` +
      `#️⃣ *Message ID:* \`${messageId || 'N/A'}\``

    await ctx.reply(idText, { parse_mode: 'MarkdownV2' })
  })

  // Command: /echo
  bot.command('echo', async (ctx) => {
    const match = ctx.match?.trim()
    if (!match) {
      return ctx.reply(
        `⚠️ *Vui lòng nhập nội dung cần echo!*\n\n_Ví dụ:_ \`/echo Xin chào TeleBot!\``,
        { parse_mode: 'MarkdownV2' }
      )
    }

    await ctx.reply(`📢 *Echo:*\n${escapeMarkdown(match)}`, {
      parse_mode: 'MarkdownV2',
    })
  })

  // Command: /info
  bot.command('info', async (ctx) => {
    const infoText =
      `ℹ️ *Thông Tin TeleBot*\n\n` +
      `🚀 *Hạ tầng:* Cloudflare Workers (V8 Isolate, Edge Network)\n` +
      `🗄️ *Database:* Supabase PostgreSQL (bảng \`telebot_subscribers\`)\n` +
      `🛠️ *Framework:* Hono \\+ grammY\n` +
      `🌐 *Worker Domain:* \`telebot.hnamhocit.workers.dev\`\n` +
      `👨‍💻 *Phát triển bởi:* Nguyễn Hoàng Nam \\(@hnamhocit\\)\n` +
      `🔗 *GitHub:* [github.com/hnamhocit](https://github.com/hnamhocit)`

    await ctx.reply(infoText, {
      parse_mode: 'MarkdownV2',
      link_preview_options: { is_disabled: true },
    })
  })

  // Callback queries
  bot.callbackQuery('sub_btn', async (ctx) => {
    await ctx.answerCallbackQuery()
    const user = ctx.from
    const chat = ctx.chat
    if (chat) {
      try {
        await SubscriberService.upsertSubscriber(env, {
          chat_id: chat.id,
          username: user?.username,
          first_name: user?.first_name,
          last_name: user?.last_name,
          status: 'active',
          tags: ['telegram', 'button_subscribe'],
        })
        await ctx.reply('✅ *Đã kích hoạt nhận tin thông báo!*', { parse_mode: 'MarkdownV2' })
      } catch (err: any) {
        await ctx.reply(`❌ Lỗi: ${err.message}`)
      }
    }
  })

  bot.callbackQuery('unsub_btn', async (ctx) => {
    await ctx.answerCallbackQuery()
    const chat = ctx.chat
    if (chat) {
      try {
        await SubscriberService.deleteSubscriber(env, chat.id, false)
        await ctx.reply('🔕 *Đã hủy nhận tin thông báo!*', { parse_mode: 'MarkdownV2' })
      } catch (err: any) {
        await ctx.reply(`❌ Lỗi: ${err.message}`)
      }
    }
  })

  bot.callbackQuery('ping_btn', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Đang đo ping...' })
    const nowIso = new Date().toISOString()
    await ctx.reply(
      `🏓 *Pong!*\n⏱️ *Thời gian phản hồi:* Edge Cloudflare\n🕒 *UTC:* \`${escapeMarkdown(nowIso)}\``,
      { parse_mode: 'MarkdownV2' }
    )
  })

  bot.callbackQuery('id_btn', async (ctx) => {
    await ctx.answerCallbackQuery()
    const user = ctx.from
    const chat = ctx.chat
    await ctx.reply(
      `🆔 *Thông tin của bạn:*\n` +
      `• User ID: \`${user.id}\`\n` +
      `• Chat ID: \`${chat?.id || user.id}\`\n` +
      `• Username: ${user.username ? `@${escapeMarkdown(user.username)}` : '_Không có_'}`,
      { parse_mode: 'MarkdownV2' }
    )
  })

  bot.callbackQuery('help_btn', async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.reply(
      `📖 *Các lệnh bạn có thể dùng:*\n` +
      `/start \\- Mở menu chính\n` +
      `/subscribe \\- Đăng ký nhận tin\n` +
      `/unsubscribe \\- Hủy nhận tin\n` +
      `/help \\- Xem trợ giúp\n` +
      `/ping \\- Thử kết nối\n` +
      `/id \\- Xem ID của bạn\n` +
      `/echo <tin nhắn> \\- Lặp lại tin nhắn\n` +
      `/info \\- Thông tin hệ thống`,
      { parse_mode: 'MarkdownV2' }
    )
  })

  bot.callbackQuery('info_btn', async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.reply(
      `ℹ️ *TeleBot Cloudflare Worker*\n` +
      `Được xây dựng với *grammY* & *Hono* trên *Cloudflare Workers* kết nối *Supabase*\\.\n` +
      `Tác giả: *Hoàng Nam* \\(@hnamhocit\\)`,
      { parse_mode: 'MarkdownV2' }
    )
  })

  // Fallback for regular text messages
  bot.on('message:text', async (ctx) => {
    // If message starts with '/', let it pass (unknown command)
    if (ctx.message.text.startsWith('/')) {
      return ctx.reply(
        `❓ Lệnh không hợp lệ. Vui lòng bấm /help để xem danh sách lệnh được hỗ trợ!`,
        { reply_to_message_id: ctx.message.message_id }
      )
    }

    const replyText =
      `💬 Bạn vừa gửi:\n_${escapeMarkdown(ctx.message.text)}_\n\n` +
      `👉 Gõ /help để khám phá tất cả các lệnh hỗ trợ!`

    await ctx.reply(replyText, {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: ctx.message.message_id,
    })
  })
}

/**
 * Escapes characters reserved by Telegram MarkdownV2 formatting.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
