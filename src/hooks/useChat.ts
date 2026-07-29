import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ChatMessage, ConversationMeta, UserProfile, RedisConfig, RedisStatus } from '../types/chat';

export function useChat(accessKey: string | null | undefined) {
  const [redisStatus, setRedisStatus] = useState<RedisStatus>({ connected: false, host: '', port: 0 });
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [myProfile, setMyProfile] = useState<UserProfile>({
    accessKey: accessKey || '', nickname: accessKey || '', avatar: undefined, createdAt: 0,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const hbRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }, []);

  const refreshOnlineUsers = useCallback(async () => {
    try { setOnlineUsers(await invoke<UserProfile[]>('get_online_users')); } catch {}
  }, []);

  const refreshProfiles = useCallback(async () => {
    try { setAllProfiles(await invoke<UserProfile[]>('list_chat_profiles')); } catch {}
  }, []);

  const refreshConversations = useCallback(async () => {
    try { setConversations(await invoke<ConversationMeta[]>('get_conversations')); } catch {}
  }, []);

  const loadMyProfile = useCallback(async () => {
    if (!accessKey) return;
    try { setMyProfile(await invoke<UserProfile>('get_user_profile', { accessKey })); } catch {}
  }, [accessKey]);

  const connectRedis = useCallback(async (config: RedisConfig) => {
    try {
      await invoke('connect_redis', { config });
      const unlisten = await listen<string>('chat-message', (event) => {
        try {
          const msg: ChatMessage = JSON.parse(event.payload);
          setConversations(prev => {
            const exists = prev.find(c => c.id === msg.convId);
            if (!exists) return prev;
            return prev.map(c => c.id === msg.convId ? {
              ...c,
              lastMessage: msg.type === 'text' || msg.type === 'emoji' ? msg.content
                : msg.type === 'image' ? '[图片]' : msg.type === 'file' ? `[文件] ${msg.fileName || ''}` : msg.content,
              lastMessageTime: msg.timestamp,
            } : c).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
          });
          setMessages(prev => {
            if ((msg.convId === activeConvId || msg.sender === accessKey) && !prev.find(m => m.id === msg.id))
              return [...prev, msg];
            return prev;
          });
        } catch {}
      });
      unlistenRef.current = unlisten;
      hbRef.current = setInterval(() => { invoke('heartbeat').catch(() => {}); }, 25000);
      setRedisStatus({ connected: true, host: config.host, port: config.port });
      await refreshOnlineUsers(); await refreshProfiles(); await refreshConversations(); await loadMyProfile();
    } catch (e) { showToast(`连接失败: ${e}`); }
  }, [accessKey, activeConvId, showToast, refreshOnlineUsers, refreshProfiles, refreshConversations, loadMyProfile]);

  const disconnectRedis = useCallback(async () => {
    try { await invoke('disconnect_redis'); } catch {}
    unlistenRef.current?.(); unlistenRef.current = null;
    if (hbRef.current) { clearInterval(hbRef.current); hbRef.current = null; }
    setRedisStatus({ connected: false, host: '', port: 0 });
  }, []);

  const updateMyProfile = useCallback(async (nickname: string, avatar?: string) => {
    try {
      await invoke('update_user_profile', { nickname, avatar: avatar || null });
      setMyProfile(prev => ({ ...prev, nickname, avatar }));
      showToast('Profile 已更新');
    } catch (e) { showToast(`更新失败: ${e}`); }
  }, [showToast]);

  const openConversation = useCallback(async (otherUser: string) => {
    try {
      const meta = await invoke<ConversationMeta>('get_or_create_private_conv', { otherUser });
      setActiveConvId(meta.id); setLoadingMsg(true);
      setMessages(await invoke<ChatMessage[]>('load_conversation', { convId: meta.id }));
      setLoadingMsg(false);
      setConversations(prev => prev.find(c => c.id === meta.id) ? prev : [meta, ...prev]);
    } catch (e) { showToast(`打开会话失败: ${e}`); }
  }, [showToast]);

  const openConversationById = useCallback(async (convId: string) => {
    setActiveConvId(convId); setLoadingMsg(true);
    try { setMessages(await invoke<ChatMessage[]>('load_conversation', { convId })); } catch { setMessages([]); }
    setLoadingMsg(false);
  }, []);

  const sendMessage = useCallback(async (convId: string, content: string, msgType = 'text', fileName?: string, fileSize?: number) => {
    try {
      const msg = await invoke<ChatMessage>('send_message', { convId, content, msgType, fileName: fileName || null, fileSize: fileSize || null });
      setMessages(prev => [...prev, msg]);
    } catch (e) { showToast(`发送失败: ${e}`); }
  }, [showToast]);

  const createGroup = useCallback(async (name: string, memberKeys: string[]) => {
    try {
      const meta = await invoke<ConversationMeta>('create_group', { name, memberKeys });
      setConversations(prev => [meta, ...prev]);
      showToast(`群聊 "${name}" 已创建`);
    } catch (e) { showToast(`创建失败: ${e}`); }
  }, [showToast]);

  const addMembers = useCallback(async (convId: string, memberKeys: string[]) => {
    try { await invoke('add_group_members', { convId, memberKeys }); showToast('成员已添加'); }
    catch (e) { showToast(`添加失败: ${e}`); }
  }, [showToast]);

  const uploadFile = useCallback(async (convId: string, localPath: string) => {
    try { return await invoke<string>('upload_chat_file', { convId, localPath }); }
    catch (e) { showToast(`上传失败: ${e}`); return null; }
  }, [showToast]);

  const sendCloudFile = useCallback(async (convId: string, vfsPath: string, fileName: string) => {
    try { return await invoke<string>('send_cloud_file', { convId, vfsPath, fileName }); }
    catch (e) { showToast(`发送失败: ${e}`); return null; }
  }, [showToast]);

  const captureScreenshot = useCallback(async () => {
    try { return await invoke<string>('capture_screenshot'); }
    catch (e) { showToast(`截图失败: ${e}`); return null; }
  }, [showToast]);

  const downloadFile = useCallback(async (s3Key: string, localPath: string) => {
    try { await invoke('download_chat_file', { s3Key, localPath }); showToast('文件已下载'); }
    catch (e) { showToast(`下载失败: ${e}`); }
  }, [showToast]);

  useEffect(() => () => { unlistenRef.current?.(); if (hbRef.current) clearInterval(hbRef.current); }, []);

  return {
    redisStatus, connectRedis, disconnectRedis,
    conversations, activeConvId, openConversation, openConversationById,
    messages, loadingMsg, sendMessage,
    onlineUsers, allProfiles, myProfile, updateMyProfile,
    createGroup, addMembers, refreshConversations, refreshProfiles,
    uploadFile, sendCloudFile, captureScreenshot, downloadFile,
    toast, showToast,
  };
}
