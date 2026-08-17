import { type FC, useState } from 'react';
import { useChat } from '../hooks/useChat';
import ChatSidebar from './ChatSidebar';
import ChatView from './ChatView';
import CreateGroupModal from './CreateGroupModal';
import iconSvgs from '../data/icons';

interface ChatAppProps {
  accessKey: string | null | undefined;
  unreadCounts: Record<string, number>;
}

const ChatApp: FC<ChatAppProps> = ({ accessKey, unreadCounts }) => {
  const chat = useChat(accessKey);
  const [showGroupModal, setShowGroupModal] = useState(false);

  if (!chat.wsConnected) {
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
              正在连接聊天服务器...
            </p>
            <div className="chat-loading-spinner" style={{ textAlign: 'center', padding: '8px 0' }}>
              <div className="spinner" />
            </div>
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
        unreadCounts={unreadCounts}
      />
      {chat.activeConvId ? (
        <ChatView
          convId={chat.activeConvId} conversations={chat.conversations}
          messages={chat.messages} loading={chat.loadingMsg}
          currentUserKey={accessKey || ''} allProfiles={chat.allProfiles} myProfile={chat.myProfile}
          onlineAccessKeys={chat.onlineUsers.map(u => u.accessKey)}
          onSendMessage={chat.sendMessage} onAddMembers={chat.addMembers}
          onUploadFile={chat.uploadFile}
          onCaptureScreenshot={chat.captureScreenshot} onDownloadFile={chat.downloadFile}
          shares={chat.shares} onShareFile={(path, days) => chat.shareVfsFile(chat.activeConvId!, path, days)}
          onToast={chat.showToast}
        />
      ) : (
        <div className="chat-placeholder">
          <div style={{ width: 64, height: 64, opacity: 0.4 }}>{iconSvgs.chat}</div>
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
