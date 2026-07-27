# Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement in-app text file editing with CodeMirror 6 via double-click in FileManager, with save/dirty tracking/close confirmation.

**Architecture:** Two new Rust backend commands (read_vfs_text, write_vfs_text) handle MinIO read/write of text content. A new TextEditor component wraps CodeMirror 6 with syntax highlighting, Ctrl+S save, dirty state tracking, and close confirmation. The App.tsx window system is extended to support dynamic file-editor windows.

**Tech Stack:** Tauri 2, React 19, TypeScript 6, CodeMirror 6, Rust with aws-sdk-s3

## Global Constraints

- Dark theme (one-dark) matching mos overall style
- Ctrl+S manual save + close-confirmation prompt if unsaved
- Double-click text files → open editor window; unsupported files → toast
- Same file already open → focus existing window
- Window ID format: `editor-<vfsPath>`

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/bootstrap.rs` | Modify | Add `read_vfs_text`, `write_vfs_text` commands |
| `src-tauri/src/main.rs` | Modify | Register new commands |
| `src/components/TextEditor.tsx` | Create | CodeMirror 6 editor with save/dirty/close logic |
| `src/App.tsx` | Modify | Extend OpenWindow for file windows, add openFile |
| `src/components/Window.tsx` | Modify | Add file-editor branch |
| `src/components/FileManager.tsx` | Modify | Double-click: text files → openFile, others → toast |
| `src/index.css` | Modify | TextEditor styles |
| `package.json` | Modify | Add CodeMirror 6 dependencies |

---

### Task 1: Install CodeMirror 6 Dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: none
- Produces: npm packages available for import

- [ ] **Step 1: Install CodeMirror packages**

```bash
cd D:\lily\mos && npm install codemirror @codemirror/view @codemirror/state @codemirror/commands @codemirror/search @codemirror/language @codemirror/lang-json @codemirror/lang-javascript @codemirror/lang-markdown @codemirror/lang-html @codemirror/lang-css @codemirror/lang-xml @codemirror/lang-sql @codemirror/lang-rust @codemirror/lang-python @codemirror/theme-one-dark @codemirror/autocomplete
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('codemirror'); console.log('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add CodeMirror 6 dependencies for text editor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Backend Commands (Rust)

**Files:**
- Modify: `src-tauri/src/bootstrap.rs` — add two new commands at end of file
- Modify: `src-tauri/src/main.rs` — register `read_vfs_text`, `write_vfs_text`

**Interfaces:**
- Consumes: existing `build_s3_client`, `derive_bucket_name`, `crate::AppState`
- Produces:
  - `read_vfs_text(path: String) -> Result<String, String>` — reads text from MinIO vfs/ path
  - `write_vfs_text(path: String, content: String) -> Result<(), String>` — writes text to MinIO vfs/ path

- [ ] **Step 1: Add read_vfs_text and write_vfs_text commands to bootstrap.rs**

Append after the `download_vfs_file` function:

```rust
#[tauri::command]
pub async fn read_vfs_text(
    state: State<'_, crate::AppState>,
    path: String,
) -> Result<String, String> {
    let (endpoint, access_key, secret_key) = {
        let minio = state.minio.lock().map_err(|e| e.to_string())?;
        let cfg = minio.as_ref().ok_or("未登录")?;
        (
            cfg.endpoint.clone(),
            cfg.access_key.clone(),
            cfg.secret_key.clone(),
        )
    };

    let client = build_s3_client(&endpoint, &access_key, &secret_key);
    let bucket = derive_bucket_name(&access_key);
    let key = format!("vfs/{}", path.trim_start_matches('/'));

    let resp = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|e| format!("读取文件内容失败: {}", e))?;

    String::from_utf8(bytes.to_vec()).map_err(|e| format!("文件编码错误: {}", e))
}

#[tauri::command]
pub async fn write_vfs_text(
    state: State<'_, crate::AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let (endpoint, access_key, secret_key) = {
        let minio = state.minio.lock().map_err(|e| e.to_string())?;
        let cfg = minio.as_ref().ok_or("未登录")?;
        (
            cfg.endpoint.clone(),
            cfg.access_key.clone(),
            cfg.secret_key.clone(),
        )
    };

    let client = build_s3_client(&endpoint, &access_key, &secret_key);
    let bucket = derive_bucket_name(&access_key);
    let key = format!("vfs/{}", path.trim_start_matches('/'));

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(content.as_bytes().to_vec().into())
        .send()
        .await
        .map_err(|e| format!("保存文件失败: {}", e))?;

    println!("[vfs] text saved: {}", key);
    Ok(())
}
```

- [ ] **Step 2: Register new commands in main.rs**

In `main.rs` invoke_handler, add `bootstrap::read_vfs_text, bootstrap::write_vfs_text` after `bootstrap::download_vfs_file`.

- [ ] **Step 3: Cargo check**

```bash
cd D:\lily\mos\src-tauri && cargo check 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/bootstrap.rs src-tauri/src/main.rs
git commit -m "feat: add read_vfs_text and write_vfs_text backend commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: TextEditor Component

**Files:**
- Create: `src/components/TextEditor.tsx`

**Interfaces:**
- Consumes:
  - `read_vfs_text(path)` from `@tauri-apps/api/core` (Task 2)
  - `write_vfs_text(path, content)` from `@tauri-apps/api/core` (Task 2)
- Produces:
  - `TextEditor: FC<{ filePath: string; fileName: string; onDirtyChange: (dirty: boolean) => void; onCloseRequest: () => void }>`
  - Calls `onDirtyChange(true)` when content changes, `onDirtyChange(false)` after save
  - `onCloseRequest` called when user clicks close

- [ ] **Step 1: Create TextEditor.tsx**

```tsx
import React, { type FC, useState, useEffect, useCallback, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, searchKeymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';

const LANG_BY_EXT: Record<string, () => Extension> = {
  md: () => markdown(),
  json: () => json(),
  js: () => javascript(),
  ts: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  xml: () => xml(),
  svg: () => xml(),
  sql: () => sql(),
  rs: () => rust(),
  py: () => python(),
};

function getLanguageExtension(fileName: string): Extension {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) return [];
  const ext = fileName.slice(dot + 1).toLowerCase();
  const factory = LANG_BY_EXT[ext];
  return factory ? factory() : [];
}

interface TextEditorProps {
  filePath: string;
  fileName: string;
  onDirtyChange: (dirty: boolean) => void;
  onCloseRequest: () => void;
}

const TextEditor: FC<TextEditorProps> = ({ filePath, fileName, onDirtyChange, onCloseRequest }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dirtyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
    onDirtyChange(d);
  }, [onDirtyChange]);

  const doSave = useCallback(async () => {
    if (!viewRef.current) return;
    setSaveStatus('saving');
    try {
      const content = viewRef.current.state.doc.toString();
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_vfs_text', { path: filePath, content });
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.warn('[TextEditor] save failed:', e);
      setSaveStatus('failed');
    }
  }, [filePath, setDirty]);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const text = await invoke<string>('read_vfs_text', { path: filePath });
        setLoading(false);

        if (!editorRef.current) return;

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) setDirty(true);
        });

        const saveKeymap = keymap.of([{
          key: 'Mod-s',
          run: () => { doSave(); return true; },
          preventDefault: true,
        }]);

        const state = EditorState.create({
          doc: text,
          extensions: [
            lineNumbers(),
            highlightActiveLine(),
            bracketMatching(),
            closeBrackets(),
            history(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            oneDark,
            keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
            saveKeymap,
            getLanguageExtension(fileName),
            updateListener,
            EditorView.lineWrapping,
          ],
        });

        const view = new EditorView({ state, parent: editorRef.current });
        viewRef.current = view;
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    };
    loadContent();

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="text-editor-container">
        <div className="text-editor-statusbar">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-editor-container">
        <div className="text-editor-error">
          <p>加载文件失败</p>
          <p className="text-editor-error-detail">{error}</p>
          <button onClick={onCloseRequest} className="text-editor-error-btn">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-editor-container">
      <div ref={editorRef} className="text-editor-cm" />
      <div className="text-editor-statusbar">
        <span className="text-editor-filepath">{filePath}</span>
        <span className="text-editor-save-status">
          {saveStatus === 'saving' && '保存中...'}
          {saveStatus === 'saved' && '已保存'}
          {saveStatus === 'failed' && '保存失败'}
        </span>
      </div>
    </div>
  );
};

export default TextEditor;
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:\lily\mos && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TextEditor.tsx
git commit -m "feat: add TextEditor component with CodeMirror 6

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Window System Changes (App.tsx + Window.tsx)

**Files:**
- Modify: `src/App.tsx` — extend OpenWindow, add openFile, wire to Window
- Modify: `src/components/Window.tsx` — add file-editor branch, dirty tracking, close confirmation

**Interfaces:**
- Consumes: TextEditor component (Task 3)
- Produces:
  - `openFile(filePath: string, fileName: string)` — creates or focuses file editor window
  - `OpenWindow` gains optional `filePath` and `fileName` fields

- [ ] **Step 1: Extend App.tsx**

In `App.tsx`, modify the `OpenWindow` interface:

```tsx
interface OpenWindow {
  id: string;
  app: DesktopApp;
  zIndex: number;
  filePath?: string;
  fileName?: string;
}
```

Add a static file editor app definition before the `App` function:

```tsx
const FILE_EDITOR_APP: DesktopApp = {
  id: 'file-editor',
  name: '',
  icon: 'file-manager',
  defaultWidth: 700,
  defaultHeight: 500,
  title: '',
};
```

Add the `openFile` callback inside `App` function (after `openApp`):

```tsx
const openFile = useCallback(
  (filePath: string, fileName: string) => {
    const windowId = `editor-${filePath}`;
    const existing = openWindows.find((w) => w.id === windowId);
    if (existing) {
      setMinimizedIds((prev) => {
        const next = new Set(prev);
        next.delete(windowId);
        return next;
      });
      zIndexCounter.current += 1;
      setOpenWindows((prev) =>
        prev.map((w) =>
          w.id === windowId ? { ...w, zIndex: zIndexCounter.current } : w,
        ),
      );
      setActiveWindowId(windowId);
      return;
    }

    zIndexCounter.current += 1;
    setOpenWindows((prev) => [
      ...prev,
      {
        id: windowId,
        app: { ...FILE_EDITOR_APP, name: fileName, title: fileName },
        zIndex: zIndexCounter.current,
        filePath,
        fileName,
      },
    ]);
    setActiveWindowId(windowId);
  },
  [openWindows],
);
```

Update the `Window` JSX to pass `filePath`, `fileName`, `onOpenFile`:

```tsx
<Window
  key={w.id}
  app={w.app}
  filePath={w.filePath}
  fileName={w.fileName}
  onClose={() => closeApp(w.id)}
  onFocus={() => focusApp(w.id)}
  onMinimize={() => minimizeApp(w.id)}
  onMaximize={() => toggleMaximize(w.id)}
  isMaximized={maximizedId === w.id}
  zIndex={w.zIndex}
  onOpenApp={openApp}
  onOpenFile={openFile}
/>
```

- [ ] **Step 2: Update Window.tsx**

Add import:

```tsx
import TextEditor from './TextEditor';
```

Update `WindowProps`:

```tsx
interface WindowProps {
  app: DesktopApp;
  filePath?: string;
  fileName?: string;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  isMaximized: boolean;
  zIndex: number;
  onOpenApp?: (appId: string) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
}
```

Update destructure to include new props:

```tsx
const Window: FC<WindowProps> = ({ app, filePath, fileName, onClose, onFocus, onMinimize, onMaximize, isMaximized, zIndex, onOpenApp, onOpenFile }) => {
```

Add dirty state after the `isMaximized` destructure:

```tsx
const [isDirty, setIsDirty] = useState(false);
const [showCloseConfirm, setShowCloseConfirm] = useState(false);
```

In the titlebar, update the title text to show dirty indicator:

```tsx
<span className="window-title-text">
  {isDirty ? '● ' : ''}{app.title}
</span>
```

Update the close button to check dirty state:

```tsx
<button
  onMouseDown={(e) => {
    e.stopPropagation();
    if (app.id === 'file-editor' && isDirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }}
  className="window-titlebar-btn window-titlebar-btn-close"
  title="关闭"
>
```

Update the window-body to add file-editor branch:

```tsx
<div className="window-body">
  {app.id === 'file-manager' ? (
    <FileManager onOpenApp={onOpenApp} onOpenFile={onOpenFile} />
  ) : app.id === 'recycle-bin' ? (
    <RecycleBin />
  ) : app.id === 'file-editor' && filePath && fileName ? (
    <TextEditor
      filePath={filePath}
      fileName={fileName}
      onDirtyChange={setIsDirty}
      onCloseRequest={() => {
        if (isDirty) {
          setShowCloseConfirm(true);
        } else {
          onClose();
        }
      }}
    />
  ) : (
    <div className="window-placeholder">
      ...existing placeholder content...
    </div>
  )}
</div>
```

Add close confirmation modal before the resize handles (after the window-body div):

```tsx
{showCloseConfirm && (
  <div className="fm-modal-overlay" onClick={() => setShowCloseConfirm(false)}>
    <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
      <div className="fm-modal-header">确认关闭</div>
      <div className="fm-modal-body">
        <p>文件有未保存的更改，确定要关闭吗？</p>
      </div>
      <div className="fm-modal-footer">
        <button onClick={() => setShowCloseConfirm(false)} className="fm-modal-btn fm-modal-btn-cancel">取消</button>
        <button onClick={() => { setShowCloseConfirm(false); onClose(); }} className="fm-modal-btn fm-modal-btn-danger">关闭</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:\lily\mos && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Window.tsx
git commit -m "feat: extend window system for file editor windows

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: FileManager Double-Click Logic

**Files:**
- Modify: `src/components/FileManager.tsx`

**Interfaces:**
- Consumes: `onOpenFile` prop from parent (passed through from App.tsx via Window.tsx)
- Produces: Double-click text file → `onOpenFile(path, name)`, unsupported file → toast

- [ ] **Step 1: Update FileManager props and add editable check**

Update props:

```tsx
const FileManager: FC<{ onOpenApp?: (appId: string) => void; onOpenFile?: (filePath: string, fileName: string) => void }> = ({ onOpenApp, onOpenFile }) => {
```

Add after the `getFileType` function:

```tsx
const EDITABLE_EXTS = new Set([
  'txt', 'md', 'csv', 'json',
  'js', 'ts', 'jsx', 'tsx',
  'html', 'htm', 'css', 'scss', 'less',
  'xml', 'svg',
  'py', 'sh', 'bash', 'zsh',
  'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'properties', 'env',
  'sql', 'rs', 'log',
]);

function isEditableFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return EDITABLE_EXTS.has(name.slice(dot + 1).toLowerCase());
}
```

- [ ] **Step 2: Add toast state**

Add after existing state declarations:

```tsx
const [toast, setToast] = useState<string | null>(null);
```

Add auto-dismiss:

```tsx
useEffect(() => {
  if (!toast) return;
  const timer = setTimeout(() => setToast(null), 3000);
  return () => clearTimeout(timer);
}, [toast]);
```

- [ ] **Step 3: Update double-click handler**

In the `renderTree` onClick handler, replace the file double-click block (around line 942-948):

```tsx
// Replace:
// if (!node.isDirectory && e.detail === 2) {
//   handleOpenFile(node.name, fullPath);
//   return;
// }

// With:
if (!node.isDirectory && e.detail === 2) {
  if (onOpenFile && isEditableFile(node.name)) {
    const vfsRelPath = selectedPath.slice(1).join('/');
    const fullVfsPath = vfsRelPath ? `${vfsRelPath}/${fullPath}` : fullPath;
    onOpenFile(fullVfsPath, node.name);
  } else {
    setToast('暂不支持此文件格式');
  }
  return;
}
```

- [ ] **Step 4: Add toast element**

After the `fm-content` div (before the closing `</div>` of `fm-main`):

```tsx
{toast && (
  <div className="fm-toast">{toast}</div>
)}
```

- [ ] **Step 5: TypeScript check and commit**

```bash
cd D:\lily\mos && npx tsc --noEmit 2>&1 | head -30
```

```bash
git add src/components/FileManager.tsx
git commit -m "feat: add file open support in FileManager with text editor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: CSS Styling

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: TextEditor class names, toast class name
- Produces: Visual styling

- [ ] **Step 1: Add styles**

Append to `src/index.css`:

```css
/* ── Text Editor ── */
.text-editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.text-editor-cm {
  flex: 1;
  overflow: auto;
}

.text-editor-cm .cm-editor {
  height: 100%;
}

.text-editor-cm .cm-editor .cm-scroller {
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}

.text-editor-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  background: #1a1a2e;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
  color: #6b7280;
  flex-shrink: 0;
}

.text-editor-filepath { color: #9ca3af; }
.text-editor-save-status { color: #6b7280; }

.text-editor-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
  gap: 8px;
  padding: 40px;
  text-align: center;
}

.text-editor-error-detail {
  font-size: 0.8125rem;
  color: #ef4444;
  max-width: 400px;
  word-break: break-all;
}

.text-editor-error-btn {
  margin-top: 8px;
  padding: 4px 16px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
}

.text-editor-error-btn:hover { background: #2563eb; }

/* ── Toast ── */
.fm-toast {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.85);
  color: #d1d5db;
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 100;
  pointer-events: none;
  animation: fm-toast-in 0.2s ease;
}

@keyframes fm-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "style: add TextEditor and toast styles

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Integration Verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd D:\lily\mos && npx tsc --noEmit 2>&1
```

- [ ] **Step 2: Cargo check**

```bash
cd D:\lily\mos\src-tauri && cargo check 2>&1
```

- [ ] **Step 3: Frontend build**

```bash
cd D:\lily\mos && npm run build 2>&1
```
