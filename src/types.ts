export interface Bindings {
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_SECRET_TOKEN?: string
  API_KEY?: string
  ADMIN_SECRET?: string
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
  chat_ids: Array<number | string>
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
