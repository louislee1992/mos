import { type FC, type CSSProperties } from 'react';
import type { TransferTask } from '../hooks/useTransfers';

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const statusIcon = (task: TransferTask) => {
  if (task.status === 'failed') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
        <circle cx="8" cy="8" r="6" stroke="#ef4444" strokeWidth="1.5" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (task.status === 'completed') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
        <circle cx="8" cy="8" r="6" stroke="#34d399" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" className="transfer-spinner">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeLinecap="round" />
    </svg>
  );
};

interface TransferPanelProps {
  tasks: TransferTask[];
  onClose: () => void;
  onClearCompleted: () => void;
  style?: CSSProperties;
}

const TransferPanel: FC<TransferPanelProps> = ({ tasks, onClose, onClearCompleted, style }) => {
  const hasCompleted = tasks.some((t) => t.status !== 'transferring');

  return (
    <div className="transfer-panel" style={style}>
      <div className="transfer-panel-header">
        <span className="transfer-panel-title">文件任务</span>
        <div className="transfer-panel-header-actions">
          {hasCompleted && (
            <button
              className="transfer-panel-action-btn"
              onClick={onClearCompleted}
              title="清除已完成"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                <path d="M3 4h10l-1 10a1 1 0 01-1 1H5a1 1 0 01-1-1L3 4z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M2 4h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button
            className="transfer-panel-close-btn"
            onClick={onClose}
            title="关闭"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="transfer-panel-list">
        {tasks.length === 0 ? (
          <div className="transfer-panel-empty">暂无传输任务</div>
        ) : (
          tasks.map((task) => {
            const pct = task.totalBytes > 0
              ? Math.round((task.transferredBytes / task.totalBytes) * 100)
              : task.status === 'completed' ? 100 : 0;

            return (
              <div key={task.id} className={`transfer-item transfer-item-${task.status}`}>
                <div className="transfer-item-top">
                  <span className="transfer-item-icon">
                    {statusIcon(task)}
                  </span>
                  <span className="transfer-item-name" title={task.fileName}>
                    {task.fileName}
                  </span>
                  <span className="transfer-item-pct">
                    {task.status === 'failed' ? '失败' : task.status === 'completed' ? '完成' : task.writingToStorage ? '正在写入存储…' : `${pct}%`}
                  </span>
                </div>

                <div className="transfer-item-bar-track">
                  <div
                    className={`transfer-item-bar-fill transfer-item-bar-${task.status}${task.writingToStorage ? ' transfer-item-bar-writing' : ''}`}
                    style={{ width: task.writingToStorage ? '100%' : `${pct}%` }}
                  />
                </div>

                <div className="transfer-item-meta">
                  <span className="transfer-item-direction">
                    {task.direction === 'upload' ? '↑ 上传' : task.direction === 'download' ? '↓ 下载' : '→ 移动'}
                  </span>
                  {task.direction === 'move' ? (
                    <span className="transfer-item-dest" title={`${task.sourcePath ?? ''} → ${task.destPath ?? task.vfsPath}`}>
                      {task.sourcePath ? `${task.sourcePath} → ${task.destPath || task.vfsPath}` : task.destPath || task.vfsPath}
                    </span>
                  ) : (
                    <span className="transfer-item-size">
                      {formatSize(task.transferredBytes)} / {formatSize(task.totalBytes)}
                    </span>
                  )}
                  <span className="transfer-item-time">
                    {formatTime(task.createdAt)}
                  </span>
                </div>

                {task.error && (
                  <div className="transfer-item-error">{task.error}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TransferPanel;
