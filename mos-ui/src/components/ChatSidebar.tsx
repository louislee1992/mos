import { type FC, useState, useMemo } from 'react';
import type { ConversationMeta, UserProfile } from '../types/chat';

interface ChatSidebarProps {
  conversations: ConversationMeta[];
  allProfiles: UserProfile[];
  onlineAccessKeys: string[];
  activeConvId: string | null;
  currentUserKey: string;
  myProfile: UserProfile;
  onSelectConversation: (convId: string) => void;
  onStartPrivateChat: (otherUser: string) => void;
  onCreateGroup: () => void;
  onUpdateNickname: (nickname: string) => void;
}

const ChatSidebar: FC<ChatSidebarProps> = ({
  conversations, allProfiles, onlineAccessKeys, activeConvId,
  currentUserKey, myProfile, onSelectConversation, onStartPrivateChat,
  onCreateGroup, onUpdateNickname,
}) => {
  const [search, setSearch] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [nickInput, setNickInput] = useState(myProfile.nickname);

  const filteredProfiles = useMemo(() => {
    if (!search.trim()) return allProfiles;
    const q = search.toLowerCase();
    return allProfiles.filter(p =>
      p.nickname.toLowerCase().includes(q) || p.accessKey.toLowerCase().includes(q));
  }, [allProfiles, search]);

  const getProfile = (key: string) =>
    allProfiles.find(p => p.accessKey === key) || { accessKey: key, nickname: key, avatar: undefined, createdAt: 0 };

  const getConvName = (conv: ConversationMeta) => {
    if (conv.type === 'group') return conv.name || '群聊';
    const other = conv.members.find(m => m !== currentUserKey) || conv.members[0];
    return getProfile(other).nickname;
  };

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-user" onClick={() => { setNickInput(myProfile.nickname); setShowProfile(!showProfile); }}>
          <div className="chat-avatar chat-avatar-sm">{myProfile.nickname.charAt(0).toUpperCase()}</div>
          <span className="chat-sidebar-username">{myProfile.nickname}</span>
        </div>
        <button className="chat-icon-btn" onClick={onCreateGroup} title="新建群聊">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {showProfile && (
        <div className="chat-profile-edit">
          <input className="chat-profile-input" value={nickInput}
            onChange={(e) => setNickInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onUpdateNickname(nickInput); setShowProfile(false); } }}
            placeholder="输入昵称" autoFocus />
        </div>
      )}
      <div className="chat-search">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" className="chat-search-icon">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索用户..." className="chat-search-input" />
      </div>
      <div className="chat-user-list">
        {conversations.length > 0 && !search && (
          <div className="chat-list-section">
            <div className="chat-list-label">最近聊天</div>
            {conversations.map(conv => (
              <button key={conv.id}
                className={`chat-user-item${activeConvId === conv.id ? ' chat-user-item-active' : ''}`}
                onClick={() => onSelectConversation(conv.id)}>
                <div className="chat-avatar chat-avatar-sm">{getConvName(conv).charAt(0).toUpperCase()}</div>
                <div className="chat-user-item-info">
                  <div className="chat-user-item-name">
                    {getConvName(conv)}
                    {conv.type === 'group' && <span className="chat-group-badge">群</span>}
                  </div>
                  <div className="chat-user-item-preview">{conv.lastMessage || ''}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="chat-list-section">
          <div className="chat-list-label">{search ? '搜索结果' : '所有用户'}</div>
          {filteredProfiles.filter(p => p.accessKey !== currentUserKey).map(profile => (
            <button key={profile.accessKey} className="chat-user-item"
              onClick={() => onStartPrivateChat(profile.accessKey)}>
              <div className="chat-avatar chat-avatar-sm" style={{ position: 'relative' }}>
                {profile.nickname.charAt(0).toUpperCase()}
                <span className={`chat-online-dot${onlineAccessKeys.includes(profile.accessKey) ? ' chat-online-dot-active' : ''}`} />
              </div>
              <div className="chat-user-item-info">
                <div className="chat-user-item-name">{profile.nickname}</div>
                <div className="chat-user-item-status">{onlineAccessKeys.includes(profile.accessKey) ? '在线' : '离线'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatSidebar;
