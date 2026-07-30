import { type FC, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { verifyCredentials } from '../api/auth';
import { setCredentials } from '../api/client';

interface AccountEntry {
  id: string;
  name: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  isAdmin: boolean;
  createdAt: number;
  lastUsedAt: number;
}

interface LoginScreenProps {
  onLoginSuccess: (accessKey: string) => void;
}

function getTimeString(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function getDateString(): string {
  const now = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

function getAccountColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

const ACCOUNTS_KEY = 'mos-accounts';

function loadAccounts(): AccountEntry[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(entries: AccountEntry[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(entries));
}

const LoginScreen: FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [showForm, setShowForm] = useState(false);
  const [timeStr, setTimeStr] = useState(getTimeString);
  const [dateStr] = useState(getDateString);
  const [endpoint, setEndpoint] = useState('http://');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountEntry[]>(loadAccounts);
  const [endpointFocused, setEndpointFocused] = useState(false);
  const [endpointSuggestions, setEndpointSuggestions] = useState<string[]>([]);

  const uniqueEndpoints = [...new Set(accounts.map((a) => a.endpoint))];

  const filterEndpointSuggestions = (input: string) => {
    if (!input.trim()) {
      setEndpointSuggestions(uniqueEndpoints);
    } else {
      setEndpointSuggestions(
        uniqueEndpoints.filter((ep) => ep.toLowerCase().includes(input.toLowerCase())),
      );
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setTimeStr(getTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showForm && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setShowForm(true);
      }
      if (showForm && e.key === 'Escape') {
        setShowForm(false);
        setError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForm]);

  const doLogin = useCallback(async (ep: string, ak: string, sk: string) => {
    setError(null);
    setLoading(true);
    try {
      await verifyCredentials(ep, ak, sk);
      setCredentials(ep, ak, sk);

      const now = Date.now();
      const existing = accounts.find(
        (a) => a.endpoint === ep && a.accessKey === ak,
      );
      let host = ep;
      try {
        host = new URL(ep).host;
      } catch {
        /* keep raw */
      }
      const entry: AccountEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        name: `MinIO @ ${host}`,
        endpoint: ep,
        accessKey: ak,
        secretKey: sk,
        isAdmin: existing?.isAdmin ?? false,
        createdAt: existing?.createdAt ?? now,
        lastUsedAt: now,
      };
      const updated = accounts.filter(
        (a) => !(a.endpoint === ep && a.accessKey === ak),
      );
      updated.push(entry);
      saveAccounts(updated);
      setAccounts(updated);
      onLoginSuccess(ak);
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败');
    } finally {
      setLoading(false);
    }
  }, [accounts, onLoginSuccess]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await doLogin(endpoint.trim(), accessKey.trim(), secretKey.trim());
    },
    [endpoint, accessKey, secretKey, doLogin],
  );

  const handleDeleteAccount = useCallback((id: string) => {
    const updated = accounts.filter((a) => a.id !== id);
    saveAccounts(updated);
    setAccounts(updated);
  }, [accounts]);

  const handleSelectAccount = useCallback((acc: AccountEntry) => {
    setEndpoint(acc.endpoint);
    setAccessKey(acc.accessKey);
    setSecretKey(acc.secretKey);
    setError(null);
  }, []);

  const sortedAccounts = [...accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      onClick={() => !showForm && setShowForm(true)}
    >
      {/* 锁屏层：时间 + 日期 */}
      <AnimatePresence>
        {!showForm && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30, transition: { duration: 0.3 } }}
          >
            <h1 className="text-[80px] font-light text-white tracking-tight leading-none mb-1">
              {timeStr}
            </h1>
            <p className="text-white/70 text-lg">{dateStr}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 登录表单层 */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex flex-col gap-5 p-10 rounded-xl w-[400px]"
              style={{
                background: 'rgba(22,22,42,0.9)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              }}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* 头像 */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20">
                  <svg viewBox="0 0 24 24" fill="none" width="40" height="40">
                    <circle cx="12" cy="9" r="4" stroke="white" strokeWidth="1.5" fill="none" />
                    <path d="M4 21C4 17 7.5 14.5 12 14.5C16.5 14.5 20 17 20 21"
                      stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white">mos</h2>
              </div>

              {/* 已保存账户 */}
              {sortedAccounts.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {sortedAccounts.map((acc) => (
                    <div key={acc.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => handleSelectAccount(acc)}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white
                                   border-2 border-white/20 hover:border-white/40 transition-colors cursor-pointer"
                        style={{ backgroundColor: getAccountColor(acc.id) }}
                        title={acc.name}
                      >
                        {acc.name.charAt(0).toUpperCase()}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAccount(acc.id);
                        }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 text-white
                                   flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100
                                   transition-opacity cursor-pointer hover:bg-red-500"
                      >
                        &#x00D7;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 表单 */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <div className="relative">
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => {
                      setEndpoint(e.target.value);
                      filterEndpointSuggestions(e.target.value);
                    }}
                    onFocus={() => {
                      setEndpointFocused(true);
                      filterEndpointSuggestions(endpoint);
                    }}
                    onBlur={() => {
                      // Delay hiding so click on suggestion registers
                      setTimeout(() => setEndpointFocused(false), 150);
                    }}
                    placeholder="http://127.0.0.1:9000"
                    className="w-full px-3 py-2.5 rounded-md text-sm text-white outline-none bg-white/8
                               border border-white/10 focus:border-blue-400/60 focus:bg-white/12 transition-colors"
                  />
                  {/* endpoint 自动补全建议 */}
                  {endpointFocused && endpointSuggestions.length > 0 && (
                    <div
                      className="absolute z-10 top-full left-0 right-0 mt-1 rounded-md overflow-hidden"
                      style={{
                        background: 'rgba(30,30,55,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(12px)',
                      }}
                    >
                      {endpointSuggestions.map((ep) => (
                        <button
                          key={ep}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEndpoint(ep);
                            setEndpointFocused(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10
                                     transition-colors cursor-pointer"
                        >
                          {ep}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Access Key"
                  className="w-full px-3 py-2.5 rounded-md text-sm text-white outline-none bg-white/8
                             border border-white/10 focus:border-blue-400/60 focus:bg-white/12 transition-colors"
                />
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Secret Key"
                    className="w-full px-3 py-2.5 pr-10 rounded-md text-sm text-white outline-none bg-white/8
                               border border-white/10 focus:border-blue-400/60 focus:bg-white/12 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white/80 transition-colors"
                    tabIndex={-1}
                  >
                    {showSecret ? (
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 4C5 4 1.5 10 1.5 10S5 16 10 16s8.5-6 8.5-6S15 4 10 4Z" />
                        <circle cx="10" cy="10" r="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 4C5 4 1.5 10 1.5 10S5 16 10 16s8.5-6 8.5-6S15 4 10 4Z" />
                        <circle cx="10" cy="10" r="3" />
                        <line x1="3" y1="3" x2="17" y2="17" />
                      </svg>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      className="text-sm px-3 py-2 rounded-md bg-red-500/15 border border-red-400/25 text-red-300"
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 py-2.5 rounded-md text-sm font-medium text-white
                             bg-gradient-to-br from-blue-500 to-purple-500
                             hover:from-blue-400 hover:to-purple-400
                             disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading && (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                  {loading ? '验证中...' : '连接'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoginScreen;
