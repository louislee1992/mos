# Text Editor Design

## Overview

在 mos 中实现文件打开功能：双击文本文件在新窗口中用 CodeMirror 6 编辑器打开，支持编辑和保存。不支持的格式给出提示。

## Architecture

```
App.tsx → openWindows: [ ...app windows, ...file editor windows ]
           新增 openFile(path) → 创建 type='file' 的窗口

Window.tsx → app.id === 'file-editor' → 渲染 <TextEditor />

TextEditor.tsx → CodeMirror 6 + 行号 + 语法高亮 + 搜索 + Ctrl+S 保存

FileManager.tsx → 双击文件 → 文本类型 → openFile(path)
                            → 非文本类型 → toast 提示
```

## Backend (Rust)

### New Commands in bootstrap.rs

**`read_vfs_text(path: String) -> String`**
- 从 MinIO 下载文件到临时 buffer
- 以 UTF-8 解码返回字符串
- 文件不存在或解码错误返回 Err

**`write_vfs_text(path: String, content: String) -> ()`**
- 将 content 写入临时文件
- 上传到 MinIO 对应路径，覆盖已有文件

### Registration in main.rs

两个新命令注册到 `invoke_handler`。

## Frontend

### TextEditor Component (NEW: src/components/TextEditor.tsx)

- CodeMirror 6 编辑器
- 行号、语法高亮（根据文件扩展名自动匹配语言）
- 搜索替换（Ctrl+F）
- Ctrl+S 保存 → write_vfs_text
- 修改状态追踪：有变更时窗口标题显示 `● 文件名`
- 关闭时未保存变更弹出确认对话框
- 暗色主题 (one-dark)

### Window System (App.tsx)

- `OpenWindow` 类型新增可选字段 `filePath`、`fileName`
- 新增 `openFile(filePath, fileName)` 函数
- 窗口 ID 格式：`editor-<filePath>`，已打开则聚焦
- Window.tsx 新增 `file-editor` 分支

### FileManager (FileManager.tsx)

- 双击文本文件 → `openFile(path, name)`
- 双击不支持的文件 → toast 提示 "暂不支持此文件格式"

### Dependencies

- `codemirror`
- `@codemirror/view`
- `@codemirror/state`
- `@codemirror/commands`
- `@codemirror/search`
- `@codemirror/language`
- `@codemirror/lang-json`
- `@codemirror/lang-javascript`
- `@codemirror/lang-markdown`
- `@codemirror/lang-html`
- `@codemirror/lang-css`
- `@codemirror/lang-xml`
- `@codemirror/lang-sql`
- `@codemirror/lang-rust`
- `@codemirror/lang-python`
- `@codemirror/theme-one-dark`

## Editable File Types

| 分类 | 扩展名 | CodeMirror 语言 |
|------|--------|----------------|
| 文本 | txt | plain text |
| Markdown | md | markdown |
| CSV | csv | plain text |
| JSON | json | json |
| Web | js, ts, jsx, tsx | javascript |
| Web | html, htm | html |
| Web | css, scss, less | css |
| Web | xml, svg | xml |
| 脚本 | py | python |
| 脚本 | sh, bash, zsh | shell (plain text) |
| 配置 | yaml, yml, toml, ini, conf, cfg, properties, env | plain text |
| 数据库 | sql | sql |
| Rust | rs | rust |
| 日志 | log | plain text |

非文本类型（docx, xlsx, pptx, pdf, exe, dll, zip 等及其他）：提示 "暂不支持此文件格式"

## Component States

| 状态 | 表现 |
|------|------|
| 加载中 | 编辑器区域显示加载指示器 |
| 加载失败 | 显示错误信息 + 关闭按钮 |
| 编辑中 | 正常编辑，Ctrl+S 保存 |
| 已修改未保存 | 标题显示 `● 文件名` |
| 保存中 | 状态栏短暂显示 "保存中..." |
| 保存成功 | 状态栏显示 "已保存"，标题移除 ● |
| 保存失败 | toast 提示错误信息 |
| 关闭确认 | 未保存变更时弹出确认对话框 |
