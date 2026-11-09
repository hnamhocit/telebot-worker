export interface Bindings {
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_SECRET_TOKEN?: string
  API_KEY?: string
  ADMIN_SECRET?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export interface Subscriber {
  chat_id: number
  email: string
  user_id?: string | null
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  status: 'active' | 'unsubscribed' | 'blocked' | string
  tags: string[]
  metadata: Record<string, any>
  subscribed_at: string
  updated_at: string
}

export interface UpsertSubscriberPayload {
  chat_id: number | string
  email?: string
  user_id?: string | null
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  status?: 'active' | 'unsubscribed' | 'blocked' | string
  tags?: string[]
  metadata?: Record<string, any>
}

export interface SendMessagePayload {
  chat_id: number | string
  text: string
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  buttons?: Array<
    Array<{
      text: string
      url?: string
      callback_data?: string
      web_app?: { url: string }
    }>
  >
  disable_notification?: boolean
  disable_web_page_preview?: boolean
}

export interface SendPhotoPayload {
  chat_id: number | string
  photo: string
  caption?: string
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  buttons?: Array<
    Array<{
      text: string
      url?: string
      callback_data?: string
      web_app?: { url: string }
    }>
  >
  disable_notification?: boolean
}

export interface BroadcastPayload {
  /**
   * Danh sách Chat ID nhận tin nhắn.
   * Nếu không truyền, hệ thống sẽ tự động lấy từ danh sách Subscribers đang hoạt động (status = 'active') trong Supabase!
   */
  chat_ids?: Array<number | string>
  /**
   * Lọc subscribers theo tag khi tự động lấy từ Supabase (ví dụ: ['news', 'alert'])
   */
  tags?: string[]
  /**
   * Lọc subscribers theo trạng thái (mặc định: 'active')
   */
  status?: string
  text: string
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  buttons?: Array<
    Array<{
      text: string
      url?: string
      callback_data?: string
      web_app?: { url: string }
    }>
  >
  disable_notification?: boolean
}
