import { type FC, useState, useEffect } from 'react';
import { getSystemInfo } from '../api/system';
import iconSvgs from '../data/icons';

interface SystemInfo {
  appName: string;
  appVersion: string;
  minioEndpoint: string;
  minioBucket: string;
  objectCount: number;
  totalSizeBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

type NavItem = 'system' | 'users' | 'apps';

const Settings: FC = () => {
  const [activeNav, setActiveNav] = useState<NavItem>('system');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getSystemInfo().then((info: any) => setSystemInfo(info)).catch(console.error);
    // Admin check not yet available via REST API
    setIsAdmin(false);
  }, []);

  const navItems: { id: NavItem; label: string }[] = [
    { id: 'system', label: '系统信息' },
    ...(isAdmin ? [{ id: 'users' as NavItem, label: '用户管理' }] : []),
    { id: 'apps', label: '应用管理' },
  ];

  return (
    <div className="fm-container">
      <div className="settings-sidebar">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            className={`settings-nav-btn${activeNav === item.id ? ' settings-nav-btn-active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        {activeNav === 'system' && (
          <div className="settings-info-section">
            {/* MOS 系统信息 */}
            <div className="settings-info-card">
              <div className="settings-info-card-row">
                <img src="/favicon.png" alt="MOS" width="40" height="40" />
                <div>
                  <div className="settings-info-label">系统名称</div>
                  <div className="settings-info-value">MOS</div>
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">系统说明</div>
                <div className="settings-info-value">Minio OS — 基于 MinIO 对象存储的云桌面系统</div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">版本号</div>
                <div className="settings-info-value">
                  {systemInfo ? `v${systemInfo.appVersion}` : '加载中...'}
                </div>
              </div>
            </div>

            {/* MinIO 存储信息 */}
            <div className="settings-info-card">
              <div className="settings-info-card-row">
                <span style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {iconSvgs['minio']}
                </span>
                <div>
                  <div className="settings-info-label">MinIO 服务器</div>
                  <div className="settings-info-value">
                    {systemInfo?.minioEndpoint ?? '加载中...'}
                  </div>
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">存储桶</div>
                <div className="settings-info-value">
                  {systemInfo?.minioBucket ?? '加载中...'}
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">对象数量</div>
                <div className="settings-info-value">
                  {systemInfo ? `${systemInfo.objectCount} 个对象` : '加载中...'}
                </div>
              </div>
              <div className="settings-info-item">
                <div className="settings-info-label">已用容量</div>
                <div className="settings-info-value">
                  {systemInfo ? formatBytes(systemInfo.totalSizeBytes) : '加载中...'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeNav === 'users' && (
          <div className="settings-placeholder-section">
            <p className="settings-placeholder">用户管理 — 即将推出</p>
          </div>
        )}

        {activeNav === 'apps' && (
          <div className="settings-placeholder-section">
            <p className="settings-placeholder">应用管理 — 即将推出</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
