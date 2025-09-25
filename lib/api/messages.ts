import { supabase, getBusinessId } from '@/lib/supabase';
import type { Message } from '@/lib/supabase';

export const messagesApi = {
  async createMessage(params: { title: string; content: string; ttlHours?: number; userId?: string | null; publishedAt?: string | null }): Promise<Message | null> {
    try {
      const businessId = getBusinessId();
      const { title, content, ttlHours = 24, userId = null, publishedAt = null } = params;
      const insert = {
        title,
        content,
        ttl_hours: ttlHours,
        user_id: userId,
        business_id: businessId,
        ...(publishedAt ? { published_at: publishedAt } : {}),
      } as any;

      const { data, error } = await supabase
        .from('messages')
        .insert([insert])
        .select('*')
        .single();

      if (error) {
        console.error('Error creating message:', error);
        return null;
      }
      return data as Message;
    } catch (error) {
      console.error('Error in createMessage:', error);
      return null;
    }
  },
  
  async getActiveMessageWithSender(): Promise<(Message & { sender_name?: string | null }) | null> {
    try {
      const businessId = getBusinessId();
      const nowIso = new Date().toISOString();

      const { data: message, error } = await supabase
        .from('messages')
        .select('*')
        .eq('business_id', businessId)
        .lte('published_at', nowIso)
        .gt('expires_at', nowIso)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching active message:', error);
        return null;
      }
      if (!message) return null;

      let senderName: string | null = null;
      const userId = (message as any).user_id as string | null | undefined;
      if (userId) {
        const { data: sender, error: senderErr } = await supabase
          .from('users')
          .select('name')
          .eq('id', userId)
          .maybeSingle();
        if (!senderErr) senderName = (sender as any)?.name ?? null;
      }

      return { ...(message as any), sender_name: senderName } as any;
    } catch (e) {
      console.error('Error in getActiveMessageWithSender:', e);
      return null;
    }
  },
};


