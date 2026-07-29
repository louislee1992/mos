import { type FC, useState } from 'react';
import { useChat } from '../hooks/useChat';
import ChatSidebar from './ChatSidebar';
import ChatView from './ChatView';
import CreateGroupModal from './CreateGroupModal';
import type { RedisConfig } from '../types/chat';

interface ChatAppProps { accessKey: string | null | undefined; }

const ChatApp: FC<ChatAppProps> = ({ accessKey }) => {
  const chat = useChat(accessKey);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [redisConfig, setRedisConfig] = useState<RedisConfig>({ host: '127.0.0.1', port: 6379 });
  const [showConfig, setShowConfig] = useState(true);

  if (showConfig || !chat.redisStatus.connected) {
    return (
      <div className="chat-container">
        <div className="chat-config">
          <div className="chat-config-card">
            <div className="chat-config-icon">
              <svg viewBox="0 0 64 64" width="48" height="48" fill="none">
                <rect x="8" y="10" width="48" height="36" rx="6" fill="#3b82f6" stroke="#2563eb" strokeWidth="1.5" />
                <circle cx="22" cy="28" r="4" fill="#eff6ff" />
                <circle cx="42" cy="28" r="4" fill="#eff6ff" />
                <path d="M22 38c0-4 4.5-6 10-6s10 2 10 6" stroke="#eff6ff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.125rem', color: 'var(--text-primary)' }}>聊天</h2>
            <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
              连接到 Redis 以开始聊天
            </p>
            <div className="chat-config-field">
              <label>主机</label>
              <input className="fm-modal-input" value={redisConfig.host}
                onChange={(e) => setRedisConfig(p => ({ ...p, host: e.target.value }))} placeholder="127.0.0.1" />
            </div>
            <div className="chat-config-field">
              <label>端口</label>
              <input className="fm-modal-input" type="number" value={redisConfig.port}
                onChange={(e) => setRedisConfig(p => ({ ...p, port: parseInt(e.target.value) || 6379 }))} />
            </div>
            <div className="chat-config-field">
              <label>密码 (可选)</label>
              <input className="fm-modal-input" type="password" value={redisConfig.password || ''}
                onChange={(e) => setRedisConfig(p => ({ ...p, password: e.target.value || undefined }))} placeholder="留空表示无密码" />
            </div>
            <button className="fm-modal-btn fm-modal-btn-ok" style={{ width: '100%', marginTop: 8 }}
              onClick={() => { chat.connectRedis(redisConfig); setShowConfig(false); }}>连接</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <ChatSidebar
        conversations={chat.conversations} allProfiles={chat.allProfiles}
        onlineAccessKeys={chat.onlineUsers.map(u => u.accessKey)}
        activeConvId={chat.activeConvId} currentUserKey={accessKey || ''} myProfile={chat.myProfile}
        onSelectConversation={chat.openConversationById}
        onStartPrivateChat={chat.openConversation}
        onCreateGroup={() => setShowGroupModal(true)}
        onUpdateNickname={(n) => chat.updateMyProfile(n)}
      />
      {chat.activeConvId ? (
        <ChatView
          convId={chat.activeConvId} conversations={chat.conversations}
          messages={chat.messages} loading={chat.loadingMsg}
          currentUserKey={accessKey || ''} allProfiles={chat.allProfiles} myProfile={chat.myProfile}
          onSendMessage={chat.sendMessage} onAddMembers={chat.addMembers}
          onUploadFile={chat.uploadFile} onSendCloudFile={chat.sendCloudFile}
          onCaptureScreenshot={chat.captureScreenshot} onDownloadFile={chat.downloadFile}
        />
      ) : (
        <div className="chat-placeholder">
          <svg viewBox="0 0 64 64" width="64" height="64" fill="none" opacity="0.3">
            <rect x="8" y="10" width="48" height="36" rx="6" fill="#3b82f6" stroke="#2563eb" strokeWidth="1.5" />
            <circle cx="22" cy="28" r="4" fill="#eff6ff" />
            <circle cx="42" cy="28" r="4" fill="#eff6ff" />
            <path d="M22 38c0-4 4.5-6 10-6s10 2 10 6" stroke="#eff6ff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>
          <p>选择用户开始聊天</p>
        </div>
      )}
      {showGroupModal && (
        <CreateGroupModal profiles={chat.allProfiles} currentUserKey={accessKey || ''}
          onCreate={chat.createGroup} onClose={() => setShowGroupModal(false)} />
      )}
      {chat.toast && <div className="fm-toast">{chat.toast}</div>}
    </div>
  );
};

export default ChatApp;
