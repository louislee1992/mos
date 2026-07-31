import { apiGet, apiPost, apiPut, apiUpload } from './client';
import type { ChatMessage, ConversationMeta, UserProfile } from '../types/chat';

export function listProfiles() {
  return apiGet<UserProfile[]>('/api/chat/profiles');
}

export function myProfile() {
  return apiGet<UserProfile>('/api/chat/profiles/me');
}

export function updateMyProfile(nickname: string, avatar?: string) {
  return apiPut('/api/chat/profiles/me', { nickname, avatar });
}

export function getOnlineUsers() {
  return apiGet<UserProfile[]>('/api/chat/online');
}

export function listConversations() {
  return apiGet<ConversationMeta[]>('/api/chat/conversations');
}

export function getOrCreateConversation(otherUser: string) {
  return apiPost<ConversationMeta>('/api/chat/conversations', { otherUser });
}

export function loadMessages(convId: string) {
  return apiGet<ChatMessage[]>(`/api/chat/conversations/${convId}/messages`);
}

export function sendMessage(convId: string, content: string, msgType = 'text', fileName?: string, fileSize?: number) {
  return apiPost<ChatMessage>(`/api/chat/conversations/${convId}/messages`, {
    content, msgType, fileName, fileSize,
  });
}

export function createGroup(name: string, memberKeys: string[]) {
  return apiPost<ConversationMeta>('/api/chat/groups', { name, memberKeys });
}

export function addGroupMembers(convId: string, memberKeys: string[]) {
  return apiPost(`/api/chat/groups/${convId}/members`, { memberKeys });
}

export function uploadChatFile(file: File, convId: string) {
  return apiUpload<{ s3Key: string }>('/api/chat/upload', file, { convId });
}

export function sendCloudFile(convId: string, vfsPath: string, fileName: string) {
  return apiPost<{ s3Key: string }>('/api/chat/cloud-file', { convId, vfsPath, fileName });
}

export function getSavedServer() {
  return apiGet<{ host?: string; port?: number }>('/api/chat/saved-server');
}
