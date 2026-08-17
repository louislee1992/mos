import { useState, useCallback, useEffect, useRef } from 'react';
import { chatBus } from './chatSocket';
import { apiDownloadBlob } from '../api/client';
import {
  listProfiles,
  myProfile as myProfileApi,
  updateMyProfile as updateMyProfileApi,
  getOnlineUsers,
  listConversations,
  getOrCreateConversation,
  loadMessages,
  sendMessage as sendMessageApi,
  createGroup as createGroupApi,
  addGroupMembers,
  uploadChatFile,
  sendCloudFile as sendCloudFileApi,
  markConversationRead as markConversationReadApi,
} from '../api/chat';
import { createShare as createShareApi, listMyShares, listReceivedShares } from '../api/share';
import type { ChatMessage, ConversationMeta, UserProfile } from '../types/chat';
import type { ShareRecord } from '../types/share';

const previewOf = (m: ChatMessage) =>
  m.type === 'text' || m.type === 'emoji'
    ? m.content
    : m.type === 'image'
      ? '[图片]'
      : m.type === 'file'
        ? `[文件] ${m.fileName || ''}`
        : m.type === 'share'
          ? `[分享] ${m.fileName || ''}`
          : m.content;

export function useChat(accessKey: string | null | undefined) {
  const [wsConnected, setWsConnected] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [myProfile, setMyProfile] = useState<UserProfile>({
    accessKey: accessKey || '', nickname: accessKey || '', avatar: undefined, createdAt: 0,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);

  // Refs for latest values used in WebSocket callbacks (avoid stale closures)
  const accessKeyRef = useRef(accessKey);
  const activeConvIdRef = useRef(activeConvId);
  const conversationsRef = useRef(conversations);
  useEffect(() => { accessKeyRef.current = accessKey; }, [accessKey]);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ---------------------------------------------------------------------------
  // Data refreshers (REST API)
  // ---------------------------------------------------------------------------

  const refreshOnlineUsers = useCallback(async () => {
    try {
      setOnlineUsers(await getOnlineUsers());
    } catch {
      // ignore
    }
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      setAllProfiles(await listProfiles());
    } catch {
      // ignore
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const convs = await listConversations();
      setConversations(convs);
      chatBus.emitConversations(convs);
    } catch {
      // ignore
    }
  }, []);

  const refreshShares = useCallback(async () => {
    try {
      const [mine, received] = await Promise.all([listMyShares(), listReceivedShares()]);
      setShares([...mine, ...received]);
    } catch {
      // ignore
    }
  }, []);

  const loadMyProfile = useCallback(async () => {
    if (!accessKey) return;
    try {
      setMyProfile(await myProfileApi());
    } catch {
      // ignore
    }
  }, [accessKey]);

  // ---------------------------------------------------------------------------
  // WebSocket message handler
  // ---------------------------------------------------------------------------

  const handleChatMessage = useCallback((msg: unknown) => {
    try {
      const chatMsg = msg as ChatMessage;
      if (chatMsg.type === 'share') {
        refreshShares();
      }
      if (!conversationsRef.current.some(c => c.id === chatMsg.convId)) {
        refreshConversations();
      }
      setConversations(prev => {
        const exists = prev.find(c => c.id === chatMsg.convId);
        if (!exists) return prev;
        return prev
          .map(c =>
            c.id === chatMsg.convId
              ? {
                  ...c,
                  lastMessage: previewOf(chatMsg),
                  lastMessageTime: chatMsg.timestamp,
                }
              : c,
          )
          .sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      });
      setMessages(prev => {
        if (
          (chatMsg.convId === activeConvIdRef.current ||
            chatMsg.sender === accessKeyRef.current) &&
          !prev.find(m => m.id === chatMsg.id)
        ) {
          return [...prev, chatMsg];
        }
        return prev;
      });
    } catch {
      // ignore
    }
  }, [refreshConversations, refreshShares]);

  const handleOnlineUpdate = useCallback(() => {
    refreshOnlineUsers();
    refreshProfiles();
  }, [refreshOnlineUsers, refreshProfiles]);

  // ---------------------------------------------------------------------------
  // Bus subscriptions (WebSocket lives at App level via useChatSocket)
  // ---------------------------------------------------------------------------

  useEffect(() => chatBus.subscribeConnected(setWsConnected), []);
  useEffect(() => chatBus.subscribeMessage(handleChatMessage), [handleChatMessage]);
  useEffect(() => chatBus.subscribeOnline(handleOnlineUpdate), [handleOnlineUpdate]);

  useEffect(() => {
    chatBus.setActiveConvId(activeConvId);
    return () => chatBus.setActiveConvId(null);
  }, [activeConvId]);

  useEffect(() => {
    if (!wsConnected) return;
    refreshOnlineUsers();
    refreshProfiles();
    refreshConversations();
    refreshShares();
    loadMyProfile();
  }, [wsConnected, refreshOnlineUsers, refreshProfiles, refreshConversations, refreshShares, loadMyProfile]);

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  const updateMyProfile = useCallback(
    async (nickname: string, avatar?: string) => {
      try {
        await updateMyProfileApi(nickname, avatar);
        setMyProfile(prev => ({ ...prev, nickname, avatar }));
        showToast('Profile 已更新');
      } catch (e) {
        showToast(`更新失败: ${e}`);
      }
    },
    [showToast],
  );

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  const openConversation = useCallback(
    async (otherUser: string) => {
      try {
        const meta = await getOrCreateConversation(otherUser);
        setActiveConvId(meta.id);
        setLoadingMsg(true);
        setMessages(await loadMessages(meta.id));
        setLoadingMsg(false);
        setConversations(prev =>
          prev.find(c => c.id === meta.id) ? prev : [meta, ...prev],
        );
        markConversationReadApi(meta.id).catch(() => { /* ignore */ });
      } catch (e) {
        showToast(`打开会话失败: ${e}`);
      }
    },
    [showToast],
  );

  const openConversationById = useCallback(
    async (convId: string) => {
      setActiveConvId(convId);
      setLoadingMsg(true);
      try {
        setMessages(await loadMessages(convId));
      } catch {
        setMessages([]);
      }
      setLoadingMsg(false);
      markConversationReadApi(convId).catch(() => { /* ignore */ });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (
      convId: string,
      content: string,
      msgType = 'text',
      fileName?: string,
      fileSize?: number,
    ) => {
      try {
        const msg = await sendMessageApi(convId, content, msgType, fileName, fileSize);
        setMessages(prev => [...prev, msg]);
        setConversations(prev =>
          prev
            .map(c =>
              c.id === convId
                ? { ...c, lastMessage: previewOf(msg), lastMessageTime: msg.timestamp }
                : c,
            )
            .sort((a, b) => b.lastMessageTime - a.lastMessageTime),
        );
      } catch (e) {
        showToast(`发送失败: ${e}`);
      }
    },
    [showToast],
  );

  // ---------------------------------------------------------------------------
  // File share
  // ---------------------------------------------------------------------------

  const shareVfsFile = useCallback(
    async (convId: string, vfsPath: string, days: number) => {
      try {
        const rec = await createShareApi(vfsPath, days, convId);
        setShares(prev =>
          prev.some(s => s.shareId === rec.shareId) ? prev : [rec, ...prev],
        );
        await sendMessage(convId, rec.shareId, 'share', rec.name, rec.size);
      } catch (e) {
        showToast(`分享失败: ${e}`);
      }
    },
    [sendMessage, showToast],
  );

  // ---------------------------------------------------------------------------
  // Group management
  // ---------------------------------------------------------------------------

  const createGroup = useCallback(
    async (name: string, memberKeys: string[]) => {
      try {
        const meta = await createGroupApi(name, memberKeys);
        setConversations(prev => [meta, ...prev]);
        showToast(`群聊 "${name}" 已创建`);
      } catch (e) {
        showToast(`创建失败: ${e}`);
      }
    },
    [showToast],
  );

  const addMembers = useCallback(
    async (convId: string, memberKeys: string[]) => {
      try {
        await addGroupMembers(convId, memberKeys);
        showToast('成员已添加');
      } catch (e) {
        showToast(`添加失败: ${e}`);
      }
    },
    [showToast],
  );

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  const uploadFile = useCallback(
    async (convId: string, file: File) => {
      try {
        const result = await uploadChatFile(file, convId);
        return result.s3Key;
      } catch (e) {
        showToast(`上传失败: ${e}`);
        return null;
      }
    },
    [showToast],
  );

  const sendCloudFile = useCallback(
    async (convId: string, vfsPath: string, fileName: string) => {
      try {
        const result = await sendCloudFileApi(convId, vfsPath, fileName);
        return result?.s3Key ?? null;
      } catch (e) {
        showToast(`发送失败: ${e}`);
        return null;
      }
    },
    [showToast],
  );

  // ---------------------------------------------------------------------------
  // Screenshot (browser API)
  // ---------------------------------------------------------------------------

  const captureScreenshot = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      // Wait one frame so the video element has real data
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);

      // Stop all tracks to release the screen capture
      stream.getTracks().forEach(t => t.stop());

      // Return as base64 data URL
      return await new Promise<string | null>(resolve => {
        canvas.toBlob(blob => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        }, 'image/png');
      });
    } catch (e) {
      showToast(`截图失败: ${e}`);
      return null;
    }
  }, [showToast]);

  // ---------------------------------------------------------------------------
  // File download (browser Blob)
  // ---------------------------------------------------------------------------

  const downloadFile = useCallback(
    async (s3Key: string, filename: string) => {
      try {
        await apiDownloadBlob(
          `/api/chat/download?s3Key=${encodeURIComponent(s3Key)}`,
          filename,
        );
        showToast('文件已下载');
      } catch (e) {
        showToast(`下载失败: ${e}`);
      }
    },
    [showToast],
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    wsConnected,
    conversations,
    activeConvId,
    openConversation,
    openConversationById,
    messages,
    loadingMsg,
    sendMessage,
    onlineUsers,
    shares,
    shareVfsFile,
    allProfiles,
    myProfile,
    updateMyProfile,
    createGroup,
    addMembers,
    refreshConversations,
    refreshProfiles,
    uploadFile,
    sendCloudFile,
    captureScreenshot,
    downloadFile,
    toast,
    showToast,
  };
}
