import React, { type FC, useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/client';

interface TrashNode {
  name: string;
  isDirectory: boolean;
  size: number;
  deletedAt: string;
  children: TrashNode[];
  trashKey: string;
  originalPath: string;
}

interface TrashEntry {
  name: string;
  originalPath: string;
  isDirectory: boolean;
  size: number;
  deletedAt: string;
  trashKey: string;
}

type SortKey = 'name' | 'time' | 'type' | 'size';

function insertTrashPath(children: TrashNode[], segments: string[], entry: TrashEntry, fullPath: string) {
  if (segments.length === 0) return;
  const name = segments[0];
  if (segments.length === 1) {
    const existing = children.find(c => c.name === name);
    if (!existing) {
      children.push({
        name,
        isDirectory: entry.isDirectory,
        size: entry.size,
        deletedAt: entry.deletedAt,
        children: [],
        trashKey: entry.trashKey,
        originalPath: entry.originalPath,
      });
    }
    return;
  }
  let folder = children.find(c => c.name === name && c.isDirectory);
  if (!folder) {
    folder = {
      name,
      isDirectory: true,
      size: 0,
      deletedAt: '',
      children: [],
      trashKey: '',
      originalPath: fullPath.endsWith('/') ? fullPath : `${fullPath}/`,
    };
    children.push(folder);
  }
  insertTrashPath(folder.children, segments.slice(1), entry, fullPath);
}

function buildTrashTree(entries: TrashEntry[]): TrashNode[] {
  const root: TrashNode[] = [];
  for (const entry of entries) {
    const path = entry.originalPath;
    const segments = path.split('/').filter(s => s !== '');
    if (segments.length === 0) continue;
    insertTrashPath(root, segments, entry, path);
  }
  return root;
}

function findNodeByRelPath(root: TrashNode[], relPath: string): TrashNode | null {
  if (!relPath) return null;
  const parts = relPath.split('/');
  let nodes = root;
  for (let i = 0; i < parts.length; i++) {
    const found = nodes.find(n => n.name === parts[i]);
    if (!found) return null;
    if (i === parts.length - 1) return found;
    nodes = found.children;
  }
  return null;
}

// ── formatters ──

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFileType(name: string, isDir: boolean): string {
  if (isDir) return '文件夹';
  const dot = name.lastIndexOf('.');
  if (dot === -1 || dot === name.length - 1) return '文件';
  return name.slice(dot).toLowerCase();
}

// ── icons ──

const IconFolder = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2 5.5C2 4.67 2.67 4 3.5 4h4.12l1.5 1.5h5.38c.83 0 1.5.67 1.5 1.5V15a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 15V5.5z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
  </svg>
);

const IconFolderOpen = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2 6.5C2 5.67 2.67 5 3.5 5h4.5l2 2h5c.83 0 1.5.67 1.5 1.5v6a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 14.5v-8z" fill="#F7C948" stroke="#D4A017" strokeWidth="0.8" />
  </svg>
);

const IconFile = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M5 2h6l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" fill="#6b7280" stroke="#4b5563" strokeWidth="0.8" />
    <path d="M11 2v4h4" fill="none" stroke="#4b5563" strokeWidth="0.8" />
  </svg>
);

// ── sidebar tree ──

const SidebarTree: FC<{
  nodes: TrashNode[];
  depth: number;
  selectedPath: string[];
  onSelect: (path: string[]) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}> = ({ nodes, depth, selectedPath, onSelect, expandedPaths, onToggleExpand }) => {
  return (
    <>
      {nodes.filter(n => n.isDirectory).map((node) => {
        const isSelected = depth < selectedPath.length && selectedPath[depth] === node.name;
        const hasChildren = node.children.some(c => c.isDirectory);
        const nodePath = selectedPath.slice(0, depth).concat(node.name).join('/');
        const expanded = expandedPaths.has(nodePath);

        return (
          <div key={node.name}>
            <div
              className={`fm-sidebar-row${isSelected ? ' fm-sidebar-row-active' : ''}`}
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              <span
                className={`fm-tree-arrow${hasChildren ? '' : ' fm-tree-arrow-empty'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasChildren) onToggleExpand(nodePath);
                }}
              >
                {hasChildren ? (
                  <svg viewBox="0 0 12 12" width="10" height="10" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.12s' }}>
                    <path d="M4 2l4 4-4 4" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              <button
                onClick={() => {
                  const newPath = selectedPath.slice(0, depth);
                  newPath.push(node.name);
                  onSelect(newPath);
                }}
                className="fm-sidebar-folder-btn"
              >
                {expanded && hasChildren ? <IconFolderOpen /> : <IconFolder />}
                <span className="fm-tree-name">{node.name}</span>
              </button>
            </div>
            {expanded && hasChildren && (
              <SidebarTree nodes={node.children} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} />
            )}
          </div>
        );
      })}
    </>
  );
};

// ── context menu types ──

interface CtxMenu {
  x: number;
  y: number;
  visible: boolean;
}

const RecycleBin: FC = () => {
  const [selectedPath, setSelectedPath] = useState<string[]>(['回收站']);
  const [searchQuery, setSearchQuery] = useState('');
  const [trashTree, setTrashTree] = useState<TrashNode[]>([{ name: '回收站', isDirectory: true, size: 0, deletedAt: '', children: [], trashKey: '', originalPath: '' }]);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>({ x: 0, y: 0, visible: false });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['回收站']));
  const [expandedMainDirs, setExpandedMainDirs] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // dropdowns
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [sortAsc, setSortAsc] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // column resize
  const [colWidths, setColWidths] = useState({ time: 140, type: 80, size: 80 });
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);

  // confirm modal: 'delete' | 'empty' | null
  const [confirmAction, setConfirmAction] = useState<'delete' | 'empty' | null>(null);

  const handleResizeStart = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: colWidths[col as keyof typeof colWidths] };
    setResizing(col);
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const newW = Math.max(50, resizeRef.current.startW + delta);
      setColWidths(prev => ({ ...prev, [resizeRef.current!.col]: newW }));
    };
    const onUp = () => { setResizing(null); resizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizing]);

  const loadTrash = useCallback(async () => {
    try {
      const rawEntries = await apiGet<any[]>('/api/trash');
      const entries: TrashEntry[] = rawEntries.map((r: any) => ({
        name: r.name,
        originalPath: r.originalPath,
        isDirectory: r.type === 'folder',
        size: r.size || 0,
        deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : '',
        trashKey: r.trashPath || '',
      }));
      const tree = buildTrashTree(entries);
      setTrashTree([{ name: '回收站', isDirectory: true, size: 0, deletedAt: '', children: tree, trashKey: '', originalPath: '' }]);
      setSelectedItems(new Set());
    } catch (e) {
      console.warn('[RecycleBin] loadTrash failed:', e);
    }
  }, []);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  // close context menu & dropdowns on any click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      setCtxMenu((c) => (c.visible ? { ...c, visible: false } : c));
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSortMenu(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // clear selection when directory changes
  useEffect(() => {
    setSelectedItems(new Set());
  }, [selectedPath]);

  const currentDir = selectedPath.length > 0 ? findNodeByRelPath(trashTree, selectedPath.join('/')) : null;
  const currentChildren = currentDir ? currentDir.children : trashTree;

  const handleToggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); }
      return next;
    });
  };

  // auto-expand paths along selectedPath
  useEffect(() => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.add('回收站');
      for (let i = 1; i < selectedPath.length; i++) {
        next.add(selectedPath.slice(0, i + 1).join('/'));
      }
      return next;
    });
  }, [selectedPath]);

  const handleRestore = async () => {
    try {
      const items = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean) as TrashNode[];
      for (const item of items) {
        if (item.trashKey) {
          await apiPost('/api/trash/restore', { trashPath: item.trashKey, originalPath: item.originalPath });
        }
      }
      setSelectedItems(new Set());
      loadTrash();
    } catch (e) {
      console.warn('[RecycleBin] restore failed:', e);
    }
  };

  const handlePermanentDeleteClick = () => {
    if (selectedItems.size === 0) return;
    setConfirmAction('delete');
  };

  const handlePermanentDeleteConfirm = async () => {
    try {
      const items = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean) as TrashNode[];
      for (const item of items) {
        if (item.trashKey) {
          await apiDelete(`/api/trash?trashPath=${encodeURIComponent(item.trashKey)}`);
        }
      }
      setSelectedItems(new Set());
      setConfirmAction(null);
      loadTrash();
    } catch (e) {
      console.warn('[RecycleBin] permanent delete failed:', e);
    }
  };

  const handleEmptyTrashClick = () => {
    if ((trashTree[0]?.children.length ?? 0) === 0) return;
    setConfirmAction('empty');
  };

  const handleEmptyTrashConfirm = async () => {
    try {
      const allNodes = collectAllNodes(trashTree[0]?.children || []);
      for (const node of allNodes) {
        if (node.trashKey) {
          await apiDelete(`/api/trash?trashPath=${encodeURIComponent(node.trashKey)}`);
        }
      }
      setSelectedItems(new Set());
      setConfirmAction(null);
      loadTrash();
    } catch (e) {
      console.warn('[RecycleBin] empty trash failed:', e);
    }
  };

  const deleteTargets = [...selectedItems].map(p => findNodeByRelPath(currentChildren, p)).filter(Boolean) as TrashNode[];

  const SORT_LABELS: Record<SortKey, string> = { name: '文件名', time: '删除时间', type: '类型', size: '大小' };

  // ── context menu ──

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuW = 170;
    const menuH = 150;
    let sx = e.clientX;
    let sy = e.clientY;
    if (sx + menuW > window.innerWidth) sx = e.clientX - menuW;
    if (sy + menuH > window.innerHeight) sy = e.clientY - menuH;
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    setCtxMenu({ x: sx - rect.left, y: sy - rect.top, visible: true });
  };

  const ctxItems = [
    {
      label: '刷新',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M2 8a6 6 0 0111.3-3.3M14 8a6 6 0 01-11.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      action: () => { setSelectedItems(new Set()); loadTrash(); },
    },
    {
      label: '还原',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M2 8a6 6 0 0111.3-3.3M14 8a6 6 0 01-11.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M2 2v4h4M14 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      action: handleRestore,
    },
    {
      label: '彻底删除',
      icon: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M3 4h10l-1 10a1 1 0 01-1 1H5a1 1 0 01-1-1L3 4z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 4h12M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ),
      action: handlePermanentDeleteClick,
    },
  ];

  return (
    <div className="fm-container">
      {/* ===== Confirm Modal ===== */}
      {confirmAction && (
        <div className="fm-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">
              {confirmAction === 'delete' ? '确认彻底删除' : '确认清空回收站'}
            </div>
            <div className="fm-modal-body" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {confirmAction === 'delete' ? (
                <>
                  <p>确定要彻底删除以下 {deleteTargets.length} 个{deleteTargets.length === 1 ? '项' : '项'}吗？此操作<strong style={{ color: 'var(--error)' }}>不可恢复</strong>。</p>
                  <div style={{ marginTop: '0.5rem', maxHeight: 120, overflowY: 'auto' }}>
                    {deleteTargets.map((item) => (
                      <div key={item.originalPath || item.name} style={{ padding: '0.125rem 0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        {item.isDirectory ? <IconFolder /> : <IconFile />}
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p>确定要清空回收站吗？回收站中所有文件将被<strong style={{ color: 'var(--error)' }}>永久删除</strong>，此操作<strong style={{ color: 'var(--error)' }}>不可恢复</strong>。</p>
              )}
            </div>
            <div className="fm-modal-footer">
              <button onClick={() => setConfirmAction(null)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
              <button
                onClick={confirmAction === 'delete' ? handlePermanentDeleteConfirm : handleEmptyTrashConfirm}
                className="fm-modal-btn fm-modal-btn-danger"
              >
                {confirmAction === 'delete' ? '彻底删除' : '清空回收站'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 左侧菜单栏 ===== */}
      <div className="fm-sidebar">
        <div className="fm-sidebar-section">
          <div className="fm-sidebar-tree">
            <SidebarTree nodes={trashTree} depth={0} selectedPath={selectedPath} onSelect={setSelectedPath} expandedPaths={expandedPaths} onToggleExpand={handleToggleExpand} />
          </div>
        </div>
      </div>

      {/* ===== 右侧主区域 ===== */}
      <div className="fm-main">
        {/* 工具栏 */}
        <div className="fm-toolbar">
          <div className="fm-toolbar-left">
            <button className="fm-toolbar-btn" title="后退" disabled>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="fm-toolbar-btn" title="前进" disabled>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="fm-toolbar-btn" title="刷新" onClick={loadTrash}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M2 8a6 6 0 0111.3-3.3M14 8a6 6 0 01-11.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="fm-toolbar-sep" />
            <div className="fm-breadcrumb">
              <button onClick={() => setSelectedPath(['回收站'])} className="fm-breadcrumb-item">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                  <path d="M4 5h12l-1 11a1 1 0 01-1 1H6a1 1 0 01-1-1L4 5z" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 5h14M7 5V3.5A1.5 1.5 0 018.5 2h3A1.5 1.5 0 0113 3.5V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
              {selectedPath.map((seg, i) => (
                <span key={i} className="fm-breadcrumb-seg">
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                    <path d="M4 2l4 4-4 4" stroke="#6b7280" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <button onClick={() => setSelectedPath(selectedPath.slice(0, i + 1))} className="fm-breadcrumb-item">
                    {seg}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="fm-toolbar-right">
            <div className="fm-search">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" className="fm-search-icon">
                <circle cx="7" cy="7" r="4.5" stroke="#6b7280" strokeWidth="1.3" />
                <path d="M10.5 10.5L14 14" stroke="#6b7280" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索..."
                className="fm-search-input"
              />
            </div>
          </div>
        </div>

        {/* 操作按钮栏 */}
        <div className="fm-actionbar">
          <div className="fm-actionbar-left">
            <button
              className={`fm-action-btn${selectedItems.size === 0 ? ' fm-action-btn-disabled' : ''}`}
              onClick={handleRestore}
              disabled={selectedItems.size === 0}
              title="还原"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M2 8a6 6 0 0111.3-3.3M14 8a6 6 0 01-11.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M2 2v4h4M14 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>还原</span>
            </button>
            <button
              className={`fm-action-btn${selectedItems.size === 0 ? ' fm-action-btn-disabled' : ''}`}
              onClick={handlePermanentDeleteClick}
              disabled={selectedItems.size === 0}
              title="彻底删除"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M3 4h10l-1 10a1 1 0 01-1 1H5a1 1 0 01-1-1L3 4z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M2 4h12M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span>彻底删除</span>
            </button>
            <button
              className={`fm-action-btn${(trashTree[0]?.children.length ?? 0) === 0 ? ' fm-action-btn-disabled' : ''}`}
              onClick={handleEmptyTrashClick}
              disabled={(trashTree[0]?.children.length ?? 0) === 0}
              title="清空回收站"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M3 5h10M7 4V3a1 1 0 011-1h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M4 5l.8 9.5a1 1 0 001 .5h4.4a1 1 0 001-.5L12 5" stroke="currentColor" strokeWidth="1.3" />
                <line x1="7" y1="7.5" x2="7" y2="12" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="9.5" y1="7.5" x2="9.5" y2="12" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span>清空回收站</span>
            </button>

            {/* 排序下拉 */}
            <div className="fm-dropdown-wrapper" ref={sortRef}>
              <button
                className="fm-action-btn"
                onClick={() => setShowSortMenu(!showSortMenu)}
                title="排序"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <path d="M4 2v10M1 9l3 3 3-3M12 14V4M9 7l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>排序</span>
              </button>
              {showSortMenu && (
                <div className="fm-dropdown-menu fm-dropdown-menu-right">
                  <div className="fm-dropdown-label">排序方式</div>
                  {(['name', 'time', 'type', 'size'] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      className="fm-dropdown-item"
                      onClick={() => { if (sortBy === key) setSortAsc(!sortAsc); else { setSortBy(key); setSortAsc(true); } }}
                    >
                      <span className="fm-dropdown-check">
                        {sortBy === key ? (
                          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                            <path d="M3 8l3 3 7-7" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span style={{ width: 12, display: 'inline-block' }} />
                        )}
                      </span>
                      <span>{SORT_LABELS[key]}</span>
                    </button>
                  ))}
                  <div className="fm-ctxmenu-sep" />
                  <button
                    className="fm-dropdown-item"
                    onClick={() => setSortAsc(true)}
                  >
                    <span className="fm-dropdown-check">
                      {sortAsc ? (
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                          <path d="M3 8l3 3 7-7" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <span style={{ width: 12, display: 'inline-block' }} />
                      )}
                    </span>
                    <span>升序</span>
                  </button>
                  <button
                    className="fm-dropdown-item"
                    onClick={() => setSortAsc(false)}
                  >
                    <span className="fm-dropdown-check">
                      {!sortAsc ? (
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                          <path d="M3 8l3 3 7-7" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <span style={{ width: 12, display: 'inline-block' }} />
                      )}
                    </span>
                    <span>降序</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 文件列表 */}
        <div
          className="fm-content"
          ref={contentRef}
          onContextMenu={handleContextMenu}
        >
          {currentChildren.length === 0 ? (
            <div className="fm-empty">回收站为空</div>
          ) : (
            <div className="fm-file-table">
              <div className={`fm-file-header${resizing ? ' fm-file-header-resizing' : ''}`}>
                <button className="fm-col-header fm-col-name" onClick={() => { if (sortBy === 'name') setSortAsc(!sortAsc); else { setSortBy('name'); setSortAsc(true); } }}>
                  <span>名称</span>
                  {sortBy === 'name' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                </button>
                <div className="fm-col-resize" onMouseDown={(e) => handleResizeStart('time', e)} />
                <button className="fm-col-header fm-col-time" style={{ width: colWidths.time }} onClick={() => { if (sortBy === 'time') setSortAsc(!sortAsc); else { setSortBy('time'); setSortAsc(true); } }}>
                  <span>删除时间</span>
                  {sortBy === 'time' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                </button>
                <div className="fm-col-resize" onMouseDown={(e) => handleResizeStart('type', e)} />
                <button className="fm-col-header fm-col-type" style={{ width: colWidths.type }} onClick={() => { if (sortBy === 'type') setSortAsc(!sortAsc); else { setSortBy('type'); setSortAsc(true); } }}>
                  <span>类型</span>
                  {sortBy === 'type' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                </button>
                <div className="fm-col-resize" onMouseDown={(e) => handleResizeStart('size', e)} />
                <button className="fm-col-header fm-col-size" style={{ width: colWidths.size }} onClick={() => { if (sortBy === 'size') setSortAsc(!sortAsc); else { setSortBy('size'); setSortAsc(true); } }}>
                  <span>大小</span>
                  {sortBy === 'size' && <span className="fm-sort-arrow">{sortAsc ? '▲' : '▼'}</span>}
                </button>
              </div>
              {(() => {
                const renderTree = (nodes: TrashNode[], depth: number, parentPath: string): React.ReactNode[] => {
                  const sorted = [...nodes].sort((a, b) => {
                    const dirCmp = b.isDirectory === a.isDirectory ? 0 : b.isDirectory ? 1 : -1;
                    if (dirCmp !== 0) return dirCmp;
                    let cmp = 0;
                    switch (sortBy) {
                      case 'name': cmp = a.name.localeCompare(b.name); break;
                      case 'time': cmp = a.deletedAt.localeCompare(b.deletedAt); break;
                      case 'type': cmp = getFileType(a.name, a.isDirectory).localeCompare(getFileType(b.name, b.isDirectory)); break;
                      case 'size': cmp = a.size - b.size; break;
                    }
                    return sortAsc ? cmp : -cmp;
                  });
                  const result: React.ReactNode[] = [];
                  for (const node of sorted) {
                    if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) continue;
                    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
                    const isSel = selectedItems.has(fullPath);
                    const hasChildren = node.isDirectory && node.children.length > 0;
                    const isExpanded = expandedMainDirs.has(fullPath);
                    result.push(
                      <button
                        key={fullPath}
                        onClick={(e) => {
                          if (node.isDirectory && e.detail === 2) {
                            setSelectedPath([...selectedPath, ...fullPath.split('/')]);
                            return;
                          }
                          if (node.isDirectory && hasChildren) {
                            setExpandedMainDirs(prev => {
                              const next = new Set(prev);
                              if (next.has(fullPath)) next.delete(fullPath);
                              else next.add(fullPath);
                              return next;
                            });
                          }
                          setSelectedItems(prev => {
                            const next = new Set<string>();
                            if (e.shiftKey) {
                              if (prev.has(fullPath)) next.delete(fullPath);
                              else { prev.forEach(v => next.add(v)); next.add(fullPath); }
                            } else {
                              if (!prev.has(fullPath) || prev.size !== 1) { next.clear(); next.add(fullPath); }
                            }
                            return next;
                          });
                        }}
                        className={`fm-file-row${isSel ? ' fm-file-row-selected' : ''}`}
                      >
                        <span className="fm-col-name" style={{ paddingLeft: 8 + depth * 16 }}>
                          <span className={`fm-tree-arrow${hasChildren ? '' : ' fm-tree-arrow-empty'}`} onClick={(e) => {
                            if (!hasChildren) return;
                            e.stopPropagation();
                            setExpandedMainDirs(prev => {
                              const next = new Set(prev);
                              if (next.has(fullPath)) next.delete(fullPath);
                              else next.add(fullPath);
                              return next;
                            });
                          }}>
                            {hasChildren ? (
                              <svg viewBox="0 0 12 12" width="10" height="10" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.12s' }}>
                                <path d="M4 2l4 4-4 4" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : null}
                          </span>
                          {node.isDirectory ? (isExpanded && hasChildren ? <IconFolderOpen /> : <IconFolder />) : <IconFile />}
                          <span className="fm-file-name-text">{node.name}</span>
                        </span>
                        <span className="fm-col-time" style={{ width: colWidths.time }}>{formatTime(node.deletedAt)}</span>
                        <span className="fm-col-type" style={{ width: colWidths.type }}>{getFileType(node.name, node.isDirectory)}</span>
                        <span className="fm-col-size" style={{ width: colWidths.size }}>{node.isDirectory ? '-' : formatSize(node.size)}</span>
                      </button>
                    );
                    if (isExpanded && hasChildren) {
                      result.push(...renderTree(node.children, depth + 1, fullPath));
                    }
                  }
                  return result;
                };
                return renderTree(currentChildren, 0, '');
              })()}
            </div>
          )}

          {/* context menu */}
          {ctxMenu.visible && (
            <div className="fm-ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
              {ctxItems.map((item) => (
                <button
                  key={item.label}
                  className="fm-ctxmenu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCtxMenu({ ...ctxMenu, visible: false });
                    item.action();
                  }}
                >
                  <span className="fm-ctxmenu-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function collectAllNodes(nodes: TrashNode[]): TrashNode[] {
  const result: TrashNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...collectAllNodes(node.children));
    }
  }
  return result;
}

export default RecycleBin;
