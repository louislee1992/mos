import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
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
} from '../api/chat';
import type { ChatMessage, ConversationMeta, UserProfile } from '../types/chat';

export function useChat(accessKey: string | null | undefined) {
  const [wsConnected, setWsConnected] = useState(false);
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

  // Refs for latest values used in WebSocket callbacks (avoid stale closures)
  const accessKeyRef = useRef(accessKey);
  const activeConvIdRef = useRef(activeConvId);
  useEffect(() => { accessKeyRef.current = accessKey; }, [accessKey]);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

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
      setConversations(await listConversations());
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
      setConversations(prev => {
        const exists = prev.find(c => c.id === chatMsg.convId);
        if (!exists) return prev;
        return prev
          .map(c =>
            c.id === chatMsg.convId
              ? {
                  ...c,
                  lastMessage:
                    chatMsg.type === 'text' || chatMsg.type === 'emoji'
                      ? chatMsg.content
                      : chatMsg.type === 'image'
                        ? '[图片]'
                        : chatMsg.type === 'file'
                          ? `[文件] ${chatMsg.fileName || ''}`
                          : chatMsg.content,
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
  }, []);

  const handleOnlineUpdate = useCallback(() => {
    refreshOnlineUsers();
  }, [refreshOnlineUsers]);

  const handleWsConnected = useCallback(() => {
    setWsConnected(true);
    refreshOnlineUsers();
    refreshProfiles();
    refreshConversations();
    loadMyProfile();
  }, [refreshOnlineUsers, refreshProfiles, refreshConversations, loadMyProfile]);

  const ws = useWebSocket(
    accessKey,
    handleChatMessage,
    handleOnlineUpdate,
    handleWsConnected,
  );

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  const wsConnect = useCallback(() => {
    ws.connect();
  }, [ws]);

  const wsDisconnect = useCallback(() => {
    ws.disconnect();
    setWsConnected(false);
    setConversations([]);
    setMessages([]);
    setOnlineUsers([]);
    setAllProfiles([]);
  }, [ws]);

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
      } catch (e) {
        showToast(`发送失败: ${e}`);
      }
    },
    [showToast],
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
  // Cleanup on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      ws.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Return (redisStatus -> wsConnected, connect/disconnect replaced)
  // ---------------------------------------------------------------------------

  return {
    wsConnected,
    wsConnect,
    wsDisconnect,
    conversations,
    activeConvId,
    openConversation,
    openConversationById,
    messages,
    loadingMsg,
    sendMessage,
    onlineUsers,
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
