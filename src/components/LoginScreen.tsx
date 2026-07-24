import { type FC, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoginScreenProps {
  onLoginSuccess: () => void;
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      console.log('[LoginScreen] handleSubmit, endpoint:', endpoint.trim());
      setError(null);
      setLoading(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        console.log('[LoginScreen] invoking verify_credentials');
        const result = await invoke('verify_credentials', {
          endpoint: endpoint.trim(),
          accessKey: accessKey.trim(),
          secretKey: secretKey.trim(),
        });
        console.log('[LoginScreen] verify_credentials success:', result);
        onLoginSuccess();
      } catch (err) {
        console.error('[LoginScreen] verify_credentials failed:', err);
        setError(typeof err === 'string' ? err : '连接失败，请检查凭证和地址');
      } finally {
        setLoading(false);
      }
    },
    [endpoint, accessKey, secretKey, onLoginSuccess],
  );

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

              {/* 表单 */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:9000"
                  className="w-full px-3 py-2.5 rounded-md text-sm text-white outline-none bg-white/8
                             border border-white/10 focus:border-blue-400/60 focus:bg-white/12 transition-colors"
                />
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
