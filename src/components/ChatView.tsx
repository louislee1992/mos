import { type FC, useState, useRef, useEffect } from 'react';
import type { ChatMessage, ConversationMeta, UserProfile } from '../types/chat';
import EmojiPicker from './EmojiPicker';

interface ChatViewProps {
  convId: string; conversations: ConversationMeta[];
  messages: ChatMessage[]; loading: boolean;
  currentUserKey: string; allProfiles: UserProfile[]; myProfile: UserProfile;
  onSendMessage: (convId: string, content: string, msgType: string, fileName?: string, fileSize?: number) => void;
  onAddMembers: (convId: string, memberKeys: string[]) => void;
  onUploadFile: (convId: string, file: File) => Promise<string | null>;
  onSendCloudFile: (convId: string, vfsPath: string, fileName: string) => Promise<string | null>;
  onCaptureScreenshot: () => Promise<string | null>;
  onDownloadFile: (s3Key: string, filename: string) => void;
}

const ChatView: FC<ChatViewProps> = ({
  convId, conversations, messages, loading, currentUserKey,
  allProfiles, onSendMessage, onAddMembers,
  onUploadFile, onSendCloudFile, onCaptureScreenshot, onDownloadFile,
}) => {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conv = conversations.find(c => c.id === convId);
  const isGroup = conv?.type === 'group';
  const convName = conv ? (isGroup ? (conv.name || '群聊') :
    (allProfiles.find(p => p.accessKey === conv.members.find(m => m !== currentUserKey))?.nickname || '用户')) : '';

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = () => { const t = input.trim(); if (!t) return; onSendMessage(convId, t, 'text'); setInput(''); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleEmoji = (emoji: string) => { setInput(p => p + emoji); setShowEmoji(false); textareaRef.current?.focus(); };

  const handleFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const s3k = await onUploadFile(convId, file);
    if (s3k) onSendMessage(convId, s3k, 'file', file.name, file.size);
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCloudFile = () => {
    const vfsPath = prompt('输入 VFS 文件路径 (如 notes/readme.md):');
    if (!vfsPath) return;
    const fn = vfsPath.split('/').pop() || 'file';
    onSendCloudFile(convId, vfsPath, fn).then(s3k => { if (s3k) onSendMessage(convId, s3k, 'file', fn, 0); });
  };

  const handleScreenshot = async () => { const u = await onCaptureScreenshot(); if (u) onSendMessage(convId, u, 'image'); };

  const handleAdd = () => { if (selectedMembers.size === 0) return; onAddMembers(convId, [...selectedMembers]); setSelectedMembers(new Set()); setShowAddMembers(false); };

  const fmt = (ts: number) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

  return (
    <div className="chat-view">
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-avatar chat-avatar-sm">{convName.charAt(0).toUpperCase()}</div>
          <div><div className="chat-header-name">{convName}</div>
            {isGroup && conv && <div className="chat-header-members">{conv.members.length} 人</div>}</div>
        </div>
        {!isGroup && (
          <button className="chat-icon-btn" onClick={() => setShowAddMembers(true)} title="升级为群聊">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 14c0-3 2-4.5 4-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="11" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.5 8h4M11.5 5.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M10 14c0-2 1.5-3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="message-list">
        {loading && <div className="message-loading">加载中...</div>}
        {messages.map(msg => {
          const isSelf = msg.sender === currentUserKey;
          return (
            <div key={msg.id} className={`message-item${isSelf ? ' message-item-self' : ''}`}>
              {!isSelf && <div className="message-avatar">{msg.senderName.charAt(0).toUpperCase()}</div>}
              <div className={`message-bubble${isSelf ? ' message-bubble-self' : ''}`}>
                {!isSelf && <div className="message-sender">{msg.senderName}</div>}
                {msg.type === 'system' ? <div className="message-system">{msg.content}</div>
                 : msg.type === 'image' ? <img src={msg.content} alt="截图" className="message-image" />
                 : msg.type === 'file' ? (
                  <div className="message-file">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M4 1h5l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8"/><path d="M9 1v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8"/></svg>
                    <span>{msg.fileName || '文件'}</span>
                    <button className="message-file-dl" onClick={() => onDownloadFile(msg.content, msg.fileName || 'file')}>下载</button>
                  </div>
                 ) : msg.type === 'emoji' ? <span style={{ fontSize: '2rem' }}>{msg.content}</span>
                 : <div className="message-text">{msg.content}</div>}
                <div className="message-time">{fmt(msg.timestamp)}</div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-area">
        <div className="message-input-toolbar">
          <button className="chat-icon-btn" onClick={() => setShowEmoji(!showEmoji)} title="表情">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><circle cx="5.5" cy="7" r="0.8" fill="currentColor"/><circle cx="10.5" cy="7" r="0.8" fill="currentColor"/><path d="M5 10c1 1.5 3 1.5 5 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
          <button className="chat-icon-btn" onClick={handleScreenshot} title="截图">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><rect x="1" y="3" width="11" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M5 1h7l3 3v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="6" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1"/></svg>
          </button>
          <button className="chat-icon-btn" onClick={handleFile} title="发送文件">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M4 1h5l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8"/><path d="M9 1v3h3" fill="none" stroke="#4b5563" strokeWidth="0.8"/></svg>
          </button>
          <button className="chat-icon-btn" onClick={handleCloudFile} title="发送网盘文件">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M2 10l3-3 2 2 3-4 4 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>
        {showEmoji && <EmojiPicker onSelect={handleEmoji} onClose={() => setShowEmoji(false)} />}
        <div className="message-input-row">
          <textarea ref={textareaRef} className="message-input" value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows={2} />
          <button className="message-send-btn" onClick={handleSend} disabled={!input.trim()}>发送</button>
        </div>
      </div>

      {showAddMembers && (
        <div className="fm-modal-overlay" onClick={() => setShowAddMembers(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="fm-modal-header">添加成员</div>
            <div className="fm-modal-body">
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {allProfiles.filter(p => p.accessKey !== currentUserKey && !(conv?.members.includes(p.accessKey))).map(p => (
                  <label key={p.accessKey} className="chat-member-check">
                    <input type="checkbox" checked={selectedMembers.has(p.accessKey)}
                      onChange={() => setSelectedMembers(prev => { const n = new Set(prev); n.has(p.accessKey) ? n.delete(p.accessKey) : n.add(p.accessKey); return n; })} />
                    <span>{p.nickname}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setShowAddMembers(false)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button onClick={handleAdd} className="fm-modal-btn fm-modal-btn-ok">确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatView;
