export interface Bindings {
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_SECRET_TOKEN?: string
  INTERNAL_SECRET: string
  TELEBOT_APP_ID: string
  TELEBOT_DIRECT_LIMIT: RateLimit
  TELEBOT_BROADCAST_LIMIT: RateLimit
  TELEBOT_RECIPIENT_LIMIT: { limit(options: { key: string; delta: number }): Promise<{ success: boolean }> }
  NOTIFICATIONS: Queue<NotificationJob>
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export interface Subscriber {
  chat_id: number
  user_id?: string | null
  username?: string | null
  status: 'active' | 'inactive'
  tags: string[]
}

export interface SendMessagePayload {
  userId?: string
  chatId?: number
  text: string
  parseMode?: 'HTML' | 'MarkdownV2'
}

export interface BroadcastPayload {
  tag?: string
  text: string
  parseMode?: 'HTML'
}

export interface NotificationJob {
  chatId: number
  text: string
  parseMode?: 'HTML' | 'MarkdownV2'
}

export type UpsertSubscriberPayload = Omit<Partial<Subscriber>, 'chat_id'> & {
  chat_id: number | string
  email?: string
  first_name?: string | null
  last_name?: string | null
  metadata?: Record<string, unknown>
}
