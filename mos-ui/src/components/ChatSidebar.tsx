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
  unreadCounts: Record<string, number>;
}

type MergedItem =
  | { kind: 'group'; conv: ConversationMeta }
  | { kind: 'user'; profile: UserProfile; conv?: ConversationMeta };

const avatarColor = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 45%)`;
};

const ChatSidebar: FC<ChatSidebarProps> = ({
  conversations, allProfiles, onlineAccessKeys, activeConvId,
  currentUserKey, myProfile, onSelectConversation, onStartPrivateChat,
  onCreateGroup, onUpdateNickname, unreadCounts,
}) => {
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [nickInput, setNickInput] = useState(myProfile.nickname);

  const onlineSet = useMemo(() => new Set(onlineAccessKeys), [onlineAccessKeys]);

  const mergedItems = useMemo(() => {
    const privateByUser = new Map<string, ConversationMeta>();
    const groups: ConversationMeta[] = [];
    for (const conv of conversations) {
      if (conv.type === 'group') {
        groups.push(conv);
      } else {
        const other = conv.members.find(m => m !== currentUserKey);
        if (other) privateByUser.set(other, conv);
      }
    }
    const items: MergedItem[] = [
      ...groups.map(conv => ({ kind: 'group' as const, conv })),
      ...allProfiles
        .filter(p => p.accessKey !== currentUserKey)
        .map(p => ({ kind: 'user' as const, profile: p, conv: privateByUser.get(p.accessKey) })),
    ];
    const q = search.trim().toLowerCase();
    return items
      .filter(item => {
        if (!q) return true;
        if (item.kind === 'group') return (item.conv.name || '群聊').toLowerCase().includes(q);
        return item.profile.nickname.toLowerCase().includes(q)
          || item.profile.accessKey.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const at = a.kind === 'group' ? a.conv.lastMessageTime : (a.conv?.lastMessageTime ?? 0);
        const bt = b.kind === 'group' ? b.conv.lastMessageTime : (b.conv?.lastMessageTime ?? 0);
        if (at > 0 !== bt > 0) return at > 0 ? -1 : 1;
        if (at > 0) return bt - at;
        const an = a.kind === 'group' ? (a.conv.name || '群聊') : a.profile.nickname;
        const bn = b.kind === 'group' ? (b.conv.name || '群聊') : b.profile.nickname;
        return an.localeCompare(bn);
      });
  }, [conversations, allProfiles, currentUserKey, search, onlineSet]);

  const renderAvatar = (key: string, nickname: string) => {
    const online = onlineSet.has(key);
    const color = online ? avatarColor(key) : undefined;
    return (
      <div
        className={`chat-avatar chat-avatar-sm${online ? ' chat-avatar-online' : ' chat-avatar-offline'}`}
        style={color ? { background: color, color: '#fff' } : undefined}
      >
        {nickname.charAt(0).toUpperCase()}
        <span className={`chat-online-dot${online ? ' chat-online-dot-active' : ''}`} />
      </div>
    );
  };

  const saveNickname = () => {
    const n = nickInput.trim();
    if (!n) return;
    onUpdateNickname(n);
    setShowSettings(false);
  };

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-user">
          {renderAvatar(currentUserKey, myProfile.nickname)}
          <span className="chat-sidebar-username">{myProfile.nickname}</span>
        </div>
        <button className="chat-icon-btn" onClick={() => { setNickInput(myProfile.nickname); setShowSettings(true); }} title="设置">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M6.5 2.5l.5-1.5h2l.5 1.5.6.4 1.4-.7 1.4 1.4-.7 1.4.4.6 1.5.5v2l-1.5.5-.4.6.7 1.4-1.4 1.4-1.4-.7-.6.4-.5 1.5h-2l-.5-1.5-.6-.4-1.4.7-1.4-1.4.7-1.4-.4-.6-1.5-.5v-2l1.5-.5.4-.6-.7-1.4L4.4 3.6l1.4.7.6-.4.1-.4z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </button>
        <button className="chat-icon-btn" onClick={onCreateGroup} title="新建群聊">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="chat-search">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" className="chat-search-icon">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索用户..." className="chat-search-input" />
      </div>
      <div className="chat-user-list">
        <div className="chat-list-section">
          {/*<div className="chat-list-label">{search ? '搜索结果' : '所有用户'}</div>*/}
          {mergedItems.map(item =>
            item.kind === 'group' ? (
              <button key={`g:${item.conv.id}`}
                className={`chat-user-item${activeConvId === item.conv.id ? ' chat-user-item-active' : ''}`}
                onClick={() => onSelectConversation(item.conv.id)}>
                {renderAvatar(item.conv.id, item.conv.name || '群聊')}
                <div className="chat-user-item-info">
                  <div className="chat-user-item-name">
                    {item.conv.name || '群聊'}
                    <span className="chat-group-badge">群</span>
                    {(unreadCounts[item.conv.id] || 0) > 0 && (
                      <span className="chat-unread-badge">
                        {unreadCounts[item.conv.id] > 99 ? '99+' : unreadCounts[item.conv.id]}
                      </span>
                    )}
                  </div>
                  <div className="chat-user-item-preview">{item.conv.lastMessage || ''}</div>
                </div>
              </button>
            ) : (
              <button key={`u:${item.profile.accessKey}`}
                className={`chat-user-item${activeConvId === item.conv?.id ? ' chat-user-item-active' : ''}`}
                onClick={() => (item.conv
                  ? onSelectConversation(item.conv.id)
                  : onStartPrivateChat(item.profile.accessKey))}>
                {renderAvatar(item.profile.accessKey, item.profile.nickname)}
                <div className="chat-user-item-info">
                  <div className="chat-user-item-name">
                    {item.profile.nickname}
                    {item.conv && (unreadCounts[item.conv.id] || 0) > 0 && (
                      <span className="chat-unread-badge">
                        {unreadCounts[item.conv.id] > 99 ? '99+' : unreadCounts[item.conv.id]}
                      </span>
                    )}
                  </div>
                  {item.conv ? (
                    <div className="chat-user-item-preview">{item.conv.lastMessage || ''}</div>
                  ) : (
                    <div className="chat-user-item-status">
                      {onlineSet.has(item.profile.accessKey) ? '在线' : '离线'}
                    </div>
                  )}
                </div>
              </button>
            ),
          )}
        </div>
      </div>

      {showSettings && (
        <div className="fm-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="fm-modal-header">设置</div>
            <div className="fm-modal-body">
              <div className="fm-modal-field">
                <label>昵称</label>
                <input className="fm-modal-input" value={nickInput}
                  onChange={(e) => setNickInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNickname(); }}
                  placeholder="输入昵称" autoFocus />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Access Key: {currentUserKey}
              </div>
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setShowSettings(false)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={saveNickname} className="fm-modal-btn fm-modal-btn-ok" disabled={!nickInput.trim()}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatSidebar;
