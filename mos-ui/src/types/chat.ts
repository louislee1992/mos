export interface ChatMessage {
  id: string;
  convId: string;
  sender: string;
  senderName: string;
  type: 'text' | 'image' | 'file' | 'emoji' | 'system' | 'share';
  content: string;
  fileName?: string;
  fileSize: number;
  timestamp: number;
}

export interface ConversationMeta {
  id: string;
  type: 'private' | 'group';
  name?: string;
  members: string[];
  createdAt: number;
  lastMessage?: string;
  lastMessageTime: number;
  unreadCount?: number;
}

export interface UserProfile {
  accessKey: string;
  nickname: string;
  avatar?: string;
  createdAt: number;
}

