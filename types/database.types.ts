// This file will be generated from Supabase schema
// For now, we'll create placeholder types that match our expected schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          participant_1_id: string
          participant_2_id: string
          last_message_content: string | null
          last_message_time: string | null
          last_message_sender_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          participant_1_id: string
          participant_2_id: string
          last_message_content?: string | null
          last_message_time?: string | null
          last_message_sender_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          participant_1_id?: string
          participant_2_id?: string
          last_message_content?: string | null
          last_message_time?: string | null
          last_message_sender_id?: string | null
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string | null
          type: 'text' | 'image'
          media_url: string | null
          media_width: number | null
          media_height: number | null
          status: 'sent' | 'delivered' | 'read'
          is_edited: boolean
          is_deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content?: string | null
          type: 'text' | 'image'
          media_url?: string | null
          media_width?: number | null
          media_height?: number | null
          status?: 'sent' | 'delivered' | 'read'
          is_edited?: boolean
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string | null
          type?: 'text' | 'image'
          media_url?: string | null
          media_width?: number | null
          media_height?: number | null
          status?: 'sent' | 'delivered' | 'read'
          is_edited?: boolean
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      unread_counts: {
        Row: {
          user_id: string
          conversation_id: string
          count: number
        }
        Insert: {
          user_id: string
          conversation_id: string
          count?: number
        }
        Update: {
          user_id?: string
          conversation_id?: string
          count?: number
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
