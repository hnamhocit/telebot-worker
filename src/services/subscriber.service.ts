import { getSupabase } from '../utils/supabase'
import type { Bindings, Subscriber, UpsertSubscriberPayload } from '../types'

export class SubscriberService {
  /**
   * Tạo hoặc cập nhật thông tin Subscriber trong Supabase
   */
  static async upsertSubscriber(
    env: Bindings | undefined,
    payload: UpsertSubscriberPayload
  ): Promise<Subscriber> {
    const supabase = getSupabase(env)
    const chatId = Number(payload.chat_id)

    if (isNaN(chatId)) {
      throw new Error('chat_id must be a valid number or numeric string')
    }

    const row = {
      chat_id: chatId,
      email: payload.email?.trim() || '',
      user_id: payload.user_id || null,
      username: payload.username?.trim() || null,
      first_name: payload.first_name?.trim() || null,
      last_name: payload.last_name?.trim() || null,
      status: payload.status || 'active',
      tags: Array.isArray(payload.tags) ? payload.tags : ['default'],
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('telebot_subscribers')
      .upsert(row, { onConflict: 'chat_id' })
      .select('*')
      .single()

    if (error) {
      console.error('[SubscriberService.upsertSubscriber] Supabase Error:', error)
      throw new Error(`Failed to upsert subscriber: ${error.message}`)
    }

    return data as Subscriber
  }

  /**
   * Lấy danh sách Subscribers có phân trang & bộ lọc
   */
  static async listSubscribers(
    env: Bindings | undefined,
    options: {
      status?: string
      tag?: string
      search?: string
      limit?: number
      offset?: number
    } = {}
  ): Promise<{ subscribers: Subscriber[]; total: number; limit: number; offset: number }> {
    const supabase = getSupabase(env)
    const limit = Math.min(Math.max(1, options.limit || 50), 200)
    const offset = Math.max(0, options.offset || 0)

    let query = supabase
      .from('telebot_subscribers')
      .select('*', { count: 'exact' })

    if (options.status && options.status !== 'all') {
      query = query.eq('status', options.status)
    }

    if (options.tag) {
      query = query.contains('tags', [options.tag])
    }

    if (options.search) {
      const term = options.search.trim()
      query = query.or(
        `username.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`
      )
    }

    query = query
      .order('subscribed_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      console.error('[SubscriberService.listSubscribers] Supabase Error:', error)
      throw new Error(`Failed to query subscribers: ${error.message}`)
    }

    return {
      subscribers: (data || []) as Subscriber[],
      total: count || 0,
      limit,
      offset,
    }
  }

  /**
   * Lấy chi tiết một subscriber theo Chat ID
   */
  static async getSubscriber(
    env: Bindings | undefined,
    chatId: number | string
  ): Promise<Subscriber | null> {
    const supabase = getSupabase(env)
    const parsedId = Number(chatId)

    if (isNaN(parsedId)) return null

    const { data, error } = await supabase
      .from('telebot_subscribers')
      .select('*')
      .eq('chat_id', parsedId)
      .maybeSingle()

    if (error) {
      console.error('[SubscriberService.getSubscriber] Supabase Error:', error)
      throw new Error(`Failed to get subscriber: ${error.message}`)
    }

    return (data as Subscriber) || null
  }

  /**
   * Cập nhật thông tin subscriber
   */
  static async updateSubscriber(
    env: Bindings | undefined,
    chatId: number | string,
    payload: Partial<UpsertSubscriberPayload>
  ): Promise<Subscriber | null> {
    const supabase = getSupabase(env)
    const parsedId = Number(chatId)

    if (isNaN(parsedId)) {
      throw new Error('Invalid chat_id')
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (payload.email !== undefined) updates.email = payload.email.trim()
    if (payload.user_id !== undefined) updates.user_id = payload.user_id
    if (payload.username !== undefined) updates.username = payload.username
    if (payload.first_name !== undefined) updates.first_name = payload.first_name
    if (payload.last_name !== undefined) updates.last_name = payload.last_name
    if (payload.status !== undefined) updates.status = payload.status
    if (payload.tags !== undefined) updates.tags = payload.tags
    if (payload.metadata !== undefined) updates.metadata = payload.metadata

    const { data, error } = await supabase
      .from('telebot_subscribers')
      .update(updates)
      .eq('chat_id', parsedId)
      .select('*')
      .maybeSingle()

    if (error) {
      console.error('[SubscriberService.updateSubscriber] Supabase Error:', error)
      throw new Error(`Failed to update subscriber: ${error.message}`)
    }

    return (data as Subscriber) || null
  }

  /**
   * Hủy đăng ký hoặc xóa vĩnh viễn Subscriber
   */
  static async deleteSubscriber(
    env: Bindings | undefined,
    chatId: number | string,
    hardDelete = false
  ): Promise<boolean> {
    const supabase = getSupabase(env)
    const parsedId = Number(chatId)

    if (isNaN(parsedId)) return false

    if (hardDelete) {
      const { error } = await supabase
        .from('telebot_subscribers')
        .delete()
        .eq('chat_id', parsedId)

      if (error) {
        console.error('[SubscriberService.deleteSubscriber] Supabase Error:', error)
        throw new Error(`Failed to delete subscriber: ${error.message}`)
      }
      return true
    }

    // Soft delete: chuyển trạng thái sang unsubscribed
    const { error } = await supabase
      .from('telebot_subscribers')
      .update({
        status: 'unsubscribed',
        updated_at: new Date().toISOString(),
      })
      .eq('chat_id', parsedId)

    if (error) {
      console.error('[SubscriberService.deleteSubscriber] Supabase Error:', error)
      throw new Error(`Failed to unsubscribe: ${error.message}`)
    }

    return true
  }

  /**
   * Lấy danh sách Chat ID của các subscribers đang active để phục vụ Broadcast
   */
  static async getActiveChatIds(
    env: Bindings | undefined,
    options?: { tags?: string[]; status?: string }
  ): Promise<number[]> {
    const supabase = getSupabase(env)
    const targetStatus = options?.status || 'active'

    let query = supabase
      .from('telebot_subscribers')
      .select('chat_id')
      .eq('status', targetStatus)

    if (options?.tags && options.tags.length > 0) {
      query = query.contains('tags', options.tags)
    }

    const { data, error } = await query

    if (error) {
      console.error('[SubscriberService.getActiveChatIds] Supabase Error:', error)
      throw new Error(`Failed to fetch active chat IDs: ${error.message}`)
    }

    return (data || []).map((row: any) => Number(row.chat_id)).filter(Boolean)
  }
}
