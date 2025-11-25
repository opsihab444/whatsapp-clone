// Core type definitions for the WhatsApp clone application

export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read';
export type MessageType = 'text' | 'image';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  participant_1_id: string;
  participant_2_id: string;
  last_message_content: string | null;
  last_message_time: string | null;
  created_at: string;
  other_user: Profile;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: MessageType;
  media_url: string | null;
  media_width: number | null;
  media_height: number | null;
  status: MessageStatus;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  sender?: Profile;
}

export interface OptimisticMessage extends Omit<Message, 'id'> {
  id: string; // Temporary client-side ID
  optimistic: true;
}

// Service result types
export type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: ServiceError };

export interface ServiceError {
  type: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'UPLOAD_ERROR' | 'USER_EXISTS' | 'UNKNOWN_ERROR';
  message: string;
}
