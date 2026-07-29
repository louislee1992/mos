export interface ChatMessage {
  id: string;
  convId: string;
  sender: string;
  senderName: string;
  type: 'text' | 'image' | 'file' | 'emoji' | 'system';
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
}

export interface UserProfile {
  accessKey: string;
  nickname: string;
  avatar?: string;
  createdAt: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface RedisStatus {
  connected: boolean;
  host: string;
  port: number;
}
