export interface Bindings {
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_SECRET_TOKEN?: string
  INTERNAL_SECRET: string
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
