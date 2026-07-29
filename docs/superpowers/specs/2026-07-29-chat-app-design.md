# MOS 桌面聊天应用 — 设计文档

**日期:** 2026-07-29
**状态:** Draft

---

## 1. 概述

在 MOS 系统中实现类似微信 Windows 端的桌面聊天应用。用户列表和聊天窗口在一个窗体中，支持私聊、群聊、表情、文件发送和截图。实时消息使用 Redis PUB/SUB，聊天记录持久化到 MinIO。

## 2. 整体架构

```
+------------------------------------------------------+
|                   Tauri 前端 (React)                   |
|                                                       |
|  ChatApp (聊天应用组件)                                |
|  +-- ChatSidebar    左侧用户列表 + 搜索               |
|  +-- ChatView       右侧聊天区域                       |
|      +-- ChatHeader    聊天头部（用户名/群名）         |
|      +-- MessageList   消息列表                        |
|      +-- MessageInput  输入区域（文本/表情/文件/截图） |
|      +-- EmojiPicker   表情面板                        |
|  +-- CreateGroupModal  创建群聊弹窗                    |
|                                                       |
|  通过 invoke() 调用 Tauri commands                     |
|  通过 listen() 接收 Tauri events (实时消息)            |
+--------------------+---------------------------------+
                     | IPC
+--------------------+---------------------------------+
|                   Tauri 后端 (Rust)                    |
|                                                       |
|  chat.rs (新增模块)                                    |
|  +-- Redis 连接管理 (连接/心跳/重连/断开)               |
|  +-- 消息收发 (send / receive / history)               |
|  +-- 用户管理 (online status / profile / list)         |
|  +-- 会话管理 (create / list / add members)            |
|  +-- 截图功能 (xcap crate)                             |
|                                                       |
|  +---------+              +------------------+        |
|  |  Redis   |              |     MinIO (S3)    |        |
|  |---------|              |------------------|        |
|  | 在线状态 |              | 聊天记录 (JSON)   |        |
|  | 实时推送 |              | 用户 Profile      |        |
|  | 用户列表 |              | 文件附件          |        |
|  +---------+              +------------------+        |
+------------------------------------------------------+
```

- **Redis 实时层**：用户在线状态、PUB/SUB 实时消息推送、用户列表
- **MinIO 持久层**：聊天记录、用户 Profile、文件附件
- **Rust 后端**：Redis 连接管理、消息路由、MinIO 读写、截图
- **React 前端**：聊天 UI、Tauri command 调用、Tauri event 监听

## 3. Redis 数据结构

```
# 用户在线状态 (SET 集合)
online:users                            -> Set{ access_key_1, access_key_2, ... }

# 用户心跳 (String，TTL 35s，前端每 25s 刷新一次)
heartbeat:{access_key}                  -> "1"

# PUB/SUB 通道定义
channel:user:{access_key}               -> 该用户的私聊消息推送通道
channel:group:{conversation_id}         -> 群聊消息推送通道

# 系统公告通道（上线/离线通知）
channel:system                          -> 系统消息通道

# 发布消息：
PUBLISH channel:user:{target_key}  {msg_json}    # 私聊推送
PUBLISH channel:group:{conv_id}    {msg_json}    # 群聊推送
```

**心跳机制**：
- 前端每 25s 调用 `heartbeat` command → 后端 SETEX 35s
- 后端启动定时任务，每 10s SMEMBERS `online:users`，移除 TTL 过期的成员
- 用户上线/离线时通过 `channel:system` 广播状态变更

## 4. MinIO 存储布局

```
mos-chat/
+-- profiles/
|   +-- {access_key}.json          -> 用户 Profile
+-- conversations/
|   +-- {conv_id}.json             -> 消息数组
|   +-- {conv_id}_members.json     -> 会话成员元数据
+-- files/
    +-- {conv_id}/
        +-- {msg_id}_{filename}    -> 聊天附件
```

### 消息 JSON 结构

```json
{
  "id": "msg_uuid",
  "convId": "conv_xxx",
  "sender": "access_key_xxx",
  "senderName": "张三",
  "type": "text",
  "content": "你好",
  "fileName": null,
  "fileSize": 0,
  "timestamp": 1753783200000
}
```

`type` 可选值：`text` | `image` | `file` | `emoji` | `system`

### 会话元数据

```json
{
  "id": "conv_xxx",
  "type": "private",
  "name": null,
  "members": ["access_key_a", "access_key_b"],
  "createdAt": 1753783200000,
  "lastMessage": "最后一条消息摘要",
  "lastMessageTime": 1753783200000
}
```

私聊的 conversation_id 由两个成员的 access_key 排序后拼接：`conv_{sorted_key1}_{sorted_key2}`
群聊的 conversation_id 使用 UUID：`conv_{uuid}`

### 用户 Profile

```json
{
  "accessKey": "xxx",
  "nickname": "张三",
  "avatar": null,
  "createdAt": 1753783200000
}
```

## 5. Rust 后端设计

### 5.1 新增依赖 (Cargo.toml)

```toml
redis = { version = "0.25", features = ["tokio-comp", "tokio-native-tls-comp"] }
xcap = "0.3"
uuid = { version = "1", features = ["v4"] }
```

### 5.2 chat.rs 模块结构

```rust
// 数据结构
struct ChatMessage { id, conv_id, sender, sender_name, type, content, file_name, file_size, timestamp }
struct ConversationMeta { id, conv_type, name, members, created_at, last_message, last_message_time }
struct UserProfile { access_key, nickname, avatar, created_at }
struct RedisConfig { host, port, password }

// Tauri Commands
connect_redis(config) -> Result<()>
disconnect_redis() -> Result<()>
get_redis_status() -> Result<RedisStatus>
heartbeat() -> Result<()>

get_user_profile(access_key) -> Result<UserProfile>
update_user_profile(nickname, avatar) -> Result<()>
get_online_users() -> Result<Vec<UserProfile>>
get_all_users() -> Result<Vec<UserProfile>>

get_conversations() -> Result<Vec<ConversationMeta>>
load_conversation(conv_id) -> Result<Vec<ChatMessage>>
create_group(name, member_keys) -> Result<ConversationMeta>
add_group_members(conv_id, member_keys) -> Result<()>

send_message(conv_id, content, msg_type, file_name, file_size) -> Result<ChatMessage>
upload_chat_file(conv_id, local_path) -> Result<String>
capture_screenshot() -> Result<String>  // 返回 base64
```

### 5.3 Redis 连接管理

```rust
struct RedisState {
    connection: Mutex<Option<redis::aio::Connection>>,
    pubsub_handle: Mutex<Option<JoinHandle<()>>>,
    config: Mutex<Option<RedisConfig>>,
    heartbeat_timer: Mutex<Option<JoinHandle<()>>>,
}
```

连接流程：
1. `connect_redis`: 建立连接，启动 PUB/SUB 监听线程
2. PUB/SUB 线程订阅 `channel:user:{self_key}` 和 `channel:group:*`
3. 收到消息后调用 `app.emit("chat-message", msg)` 推送到前端
4. `heartbeat`: 刷新 SETEX，SMEMBERS online:users 清理过期用户
5. `disconnect_redis`: 取消订阅，关闭连接

### 5.4 消息发送流程

```
前端 invoke("send_message", { conv_id, content, type })
  -> Rust 生成 msg_id (UUID v4)
  -> 组装 ChatMessage JSON
  -> 写入 MinIO: conversations/{conv_id}.json (追加到消息数组)
  -> Redis PUBLISH: 推送到目标用户的 channel
  -> 更新会话元数据的 lastMessage
  -> 返回 ChatMessage 给发送方前端确认
```

### 5.5 截图功能

使用 `xcap` crate 实现区域截图：

```rust
#[tauri::command]
async fn capture_screenshot() -> Result<String, String> {
    // xcap 截取全屏
    // 前端在截图前隐藏自身窗口
    // 返回 base64 编码的 PNG 图片
    // 前端收到后显示编辑/确认界面
}
```

截图前前端需要最小化/隐藏所有 MOS 窗口，截图完成后恢复。

## 6. React 前端设计

### 6.1 组件树

```
ChatApp
+-- ChatSidebar                          # 左侧面板 (宽度 ~280px)
|   +-- ChatSidebarHeader                # 搜索框 + 新建群聊按钮
|   |   +-- SearchInput                  # 用户搜索输入
|   |   +-- CreateGroupButton            # 新建群聊
|   +-- ChatUserList                     # 用户/会话列表
|       +-- ChatUserItem *               # 单个用户项
|           +-- Avatar                   # 头像
|           +-- Name + LastMessage       # 名称 + 最后一条消息
|           +-- OnlineDot                # 在线状态指示灯
+-- ChatView                             # 右侧聊天区
|   +-- ChatHeader                       # 顶部栏
|   |   +-- ConversationTitle            # 用户名 / 群名
|   |   +-- OnlineStatus                 # 在线状态文字
|   |   +-- GroupManageButton            # 群管理（添加成员）
|   +-- MessageList                      # 消息列表 (可滚动)
|   |   +-- MessageItem *               # 单条消息气泡
|   |       +-- MessageBubble            # 气泡（左右分侧）
|   |       +-- MessageTime              # 时间戳
|   |       +-- FileAttachment           # 文件卡片（如果是文件消息）
|   +-- MessageInput                     # 底部输入区域
|       +-- InputToolbar                 # 工具栏按钮
|       |   +-- EmojiButton              # 表情按钮
|       |   +-- ScreenshotButton         # 截图按钮
|       |   +-- SendFileButton           # 发送文件（本地）
|       |   +-- SendCloudFileButton      # 发送网盘文件
|       +-- EmojiPicker                  # 表情选择面板（弹出）
|       +-- TextArea                     # 文本输入框
|       +-- SendButton                   # 发送按钮
+-- CreateGroupModal                     # 创建群聊弹窗
    +-- UserSelector                     # 用户多选列表
    +-- GroupNameInput                   # 群名输入
    +-- ConfirmButton                    # 确认创建
```

### 6.2 应用注册

在 `src/data/apps.ts` 中注册：

```typescript
{
  id: 'chat',
  name: '聊天',
  icon: 'chat',
  defaultWidth: 860,
  defaultHeight: 600,
  title: '聊天',
  singular: true,
}
```

在 `src/components/Window.tsx` 中添加路由分支：

```tsx
) : app.id === 'chat' ? (
  <ChatApp accessKey={accessKey} />
)
```

### 6.3 关键交互流程

**发送消息**：
```
用户在 MessageInput 输入内容 -> 按 Enter 或点击发送按钮
  -> invoke("send_message", { convId, content, type: "text" })
  -> 后端处理 -> 返回 ChatMessage
  -> 前端将返回的消息添加到本地消息列表（乐观更新，确认后替换）
```

**接收实时消息**：
```
Rust 后端收到 Redis PUB/SUB 消息
  -> app.emit("chat-message", msg_json)
  -> 前端 listen("chat-message", (e) => { ... })
  -> 判断消息属于哪个会话
  -> 如果当前正在查看该会话：追加到 MessageList
  -> 否则：更新 ChatUserItem 的最后消息预览 + 未读标记
```

**发送文件**：
```
点击发送文件按钮 -> invoke("open", { ... }) 选择本地文件
  -> invoke("upload_chat_file", { convId, localPath })
  -> 后端上传到 MinIO mos-chat/files/{convId}/{msgId}_{filename}
  -> 后端发送 file 类型消息
  -> 前端显示文件卡片
```

**发送网盘文件**：
```
点击网盘文件按钮 -> 打开 FileManager 文件选择模式
  -> 用户从 VFS 中选择文件
  -> invoke("send_cloud_file", { convId, vfsPath, fileName })
  -> 后端从 MinIO 复制文件到 mos-chat/files/
  -> 发送 file 类型消息
```

**截图**：
```
点击截图按钮 -> invoke("hide_all_windows") -> invoke("capture_screenshot")
  -> 后端 xcap 截取全屏 -> 返回 base64
  -> 前端显示截图预览 + 编辑界面 -> 确认发送
  -> invoke("restore_windows") -> 发送 image 类型消息
```

**群聊升级**：
```
在私聊界面点击群管理按钮 -> 弹出 UserSelector
  -> 选择要添加的用户 -> invoke("add_group_members", { convId, memberKeys })
  -> 后端创建新的群聊 conversation，复制历史消息
  -> 更新当前会话为群聊，成员收到 system 消息通知
```

### 6.4 Hooks

```typescript
// src/hooks/useChat.ts
function useChat(accessKey: string) {
  // 管理 Redis 连接状态
  // 管理会话列表
  // 管理当前活跃会话
  // 管理消息列表
  // 管理在线用户列表
  // 提供 sendMessage, loadConversation, createGroup 等方法
}

// src/hooks/useChatEvents.ts
function useChatEvents() {
  // 监听 chat-message 事件
  // 监听 chat-system 事件（上线/离线通知）
  // 返回 cleanup 函数
}
```

### 6.5 CSS 方案

复用现有主题变量系统，新增 CSS 文件 `src/components/ChatApp.css`，主要样式：

- `.chat-container`: flex row, 填充窗口
- `.chat-sidebar`: 固定宽度 280px, 左侧面板
- `.chat-view`: flex column, 右侧聊天区
- `.message-bubble`: 聊天气泡，左侧/右侧对齐
- `.message-bubble-self`: 自己的消息（右侧，蓝色/强调色背景）
- `.message-bubble-other`: 对方消息（左侧，灰色背景）
- `.emoji-picker`: 弹出面板，网格布局
- `.online-dot`: 绿色/灰色小圆点

## 7. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src-tauri/Cargo.toml` | 修改 | 添加 redis, xcap, uuid 依赖 |
| `src-tauri/src/main.rs` | 修改 | 注册 chat 模块和 commands |
| `src-tauri/src/chat.rs` | 新增 | 聊天后端核心模块 |
| `src/data/apps.ts` | 修改 | 注册聊天应用 |
| `src/components/Window.tsx` | 修改 | 添加 ChatApp 路由 |
| `src/components/ChatApp.tsx` | 新增 | 聊天主组件 |
| `src/components/ChatSidebar.tsx` | 新增 | 用户列表面板 |
| `src/components/ChatView.tsx` | 新增 | 聊天区域 |
| `src/components/MessageInput.tsx` | 新增 | 消息输入区域 |
| `src/components/EmojiPicker.tsx` | 新增 | 表情选择器 |
| `src/components/CreateGroupModal.tsx` | 新增 | 创建群聊弹窗 |
| `src/hooks/useChat.ts` | 新增 | 聊天状态管理 hook |
| `src/data/icons.tsx` | 修改 | 添加聊天相关 SVG 图标 |
| `src/index.css` | 修改 | 添加聊天相关样式 |

## 8. 错误处理

| 场景 | 处理方式 |
|------|---------|
| Redis 连接失败 | 前端显示"聊天服务未连接"，提供重试按钮 |
| Redis 断连重连 | 后端自动重试（指数退避，最多 5 次），重连后刷新在线列表 |
| MinIO 读写失败 | 返回错误消息给前端，前端 toast 提示 |
| 发送消息失败 | 前端标记消息为"发送失败"（红色感叹号），可重发 |
| 截图失败 | 前端 toast 提示错误原因 |
| 文件上传失败 | 与现有 TransferPanel 集成，显示传输进度和错误 |

## 9. 测试策略

- **Rust 单元测试**：消息序列化/反序列化、conversation_id 生成逻辑、心跳过期清理逻辑
- **前端组件测试**：ChatSidebar 搜索过滤、MessageInput 输入行为、EmojiPicker 选择
- **集成测试**：完整的发送->推送->接收流程（需要 Redis + MinIO 环境）
- **手动测试**：私聊、群聊、文件发送、截图、离线消息重新加载
