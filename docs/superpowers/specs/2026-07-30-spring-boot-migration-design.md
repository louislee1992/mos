# Spring Boot + React 架构迁移设计

## 概述

将 MOS 项目从 Tauri (Rust + React) 单机桌面架构改造为 Spring Boot + React 多用户 Web 架构，合并部署（React 打包到 Spring Boot 静态资源目录，运行 jar 即可）。

## 迁移动机

- 支持多用户服务端部署
- 团队技术栈统一到 Java/Spring Boot
- 简化部署运维（一个 jar 包）

## 核心设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 认证方式 | 保留 MinIO 凭据登录 | 数据天然隔离，无需用户注册系统 |
| 数据存储 | 纯 MinIO（无数据库） | 最简部署依赖 |
| UI 风格 | 保留桌面 OS 隐喻 | React 组件复用度高，迁移成本低 |
| 实时通信 | WebSocket (STOMP) | 替代 Redis Pub/Sub + Tauri Events |
| 在线管理 | 服务端 ConcurrentHashMap | 替代 Redis heartbeat/online:users |
| 账户保存 | 浏览器 localStorage | 替代本地加密文件 |
| 截图 | getDisplayMedia API | 替代 xcap 桌面截图 |

---

## 项目结构

```
mos-server/                          ← 新 Spring Boot 项目
├── pom.xml
├── src/main/java/com/mos/
│   ├── MosApplication.java
│   ├── config/
│   │   ├── MinioConfig.java         ← MinIO S3 客户端配置（多用户 session 级别）
│   │   ├── WebSocketConfig.java     ← WebSocket/STOMP 配置
│   │   └── WebMvcConfig.java        ← SPA fallback 路由
│   ├── controller/
│   │   ├── AuthController.java
│   │   ├── VfsController.java
│   │   ├── SettingsController.java
│   │   ├── TrashController.java
│   │   ├── ChatController.java
│   │   ├── TransferController.java
│   │   └── SystemController.java
│   ├── service/
│   │   ├── MinioService.java        ← S3 操作封装
│   │   ├── VfsService.java          ← VFS 树构建、路径管理
│   │   ├── ChatService.java         ← 聊天业务逻辑
│   │   ├── OnlineUserService.java   ← WebSocket 在线用户管理
│   │   ├── SettingsService.java     ← 设置读写
│   │   └── SystemService.java       ← 系统信息
│   ├── model/                       ← DTO 和领域对象
│   └── websocket/
│       ├── ChatWebSocketHandler.java
│       └── TransferWebSocketHandler.java
├── src/main/resources/
│   ├── application.yml
│   ├── static/                      ← React 构建产物
│   │   ├── index.html
│   │   ├── assets/
│   │   └── favicon.png
│   └── templates/

mos-web/                             ← 现有 React 前端（适配）
├── src/
│   ├── api/                         ← 新增：REST API 封装层
│   │   ├── client.ts                ← fetch 封装（自动附加凭据 header）
│   │   ├── auth.ts
│   │   ├── vfs.ts
│   │   ├── chat.ts
│   │   ├── settings.ts
│   │   ├── transfers.ts
│   │   └── system.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts          ← 新增：STOMP WebSocket hook
│   │   ├── useChat.ts               ← 调整：invoke → api 调用
│   │   ├── useSettings.ts           ← 调整
│   │   └── useTransfers.ts          ← 调整
│   ├── components/                  ← 基本不变
│   ├── types/                       ← 不变
│   └── data/                        ← 不变
├── vite.config.ts                   ← 调整：输出到 ../mos-server/static
└── package.json
```

---

## 通信架构

### REST API

前端通过 `Authorization: Basic <base64(accessKey:secretKey)>` header 传递凭据。
Spring Boot 拦截器解析凭据，为每个请求创建对应的 MinIO S3 客户端。

### WebSocket (STOMP)

```
浏览器                                    Spring Boot
  │                                         │
  │──── CONNECT /ws ──────────────────────→│
  │──── SUBSCRIBE /user/queue/chat ───────→│  私人聊天消息
  │──── SUBSCRIBE /topic/online ──────────→│  在线用户变更
  │──── SUBSCRIBE /user/queue/transfer ───→│  传输进度
  │                                         │
  │──── SEND /app/chat.send ──────────────→│  发送消息
  │                                         │──── 存 MinIO
  │                                         │──── 推送给接收者
  │←─── MESSAGE /user/queue/chat ──────────│
```

- `/user/queue/chat` — 用户私人消息队列
- `/topic/online` — 在线用户变更广播
- `/user/queue/transfer` — 用户私人传输进度

### 在线用户管理

`OnlineUserService` 维护 `ConcurrentHashMap<String, WebSocketSession>`：
- WebSocket CONNECT → 注册用户上线，广播 `/topic/online`
- WebSocket DISCONNECT → 移除用户，广播 `/topic/online`
- 无需 Redis、无需心跳机制

---

## API 端点设计

### 认证 `/api/auth`

```
POST   /api/auth/verify          ← 验证 MinIO 凭据
GET    /api/auth/admin            ← 检查管理员权限
GET    /api/auth/version          ← 获取应用版本
```

### VFS 文件系统 `/api/vfs`

```
GET    /api/vfs                   ← 列出目录
POST   /api/vfs/folder            ← 创建文件夹
POST   /api/vfs/file              ← 创建空文件
POST   /api/vfs/upload            ← 上传文件 (multipart)
POST   /api/vfs/upload-folder     ← 上传文件夹
GET    /api/vfs/download          ← 下载文件
GET    /api/vfs/text              ← 读取文本文件
PUT    /api/vfs/text              ← 写入文本文件
POST   /api/vfs/copy              ← 复制
PUT    /api/vfs/rename            ← 重命名
DELETE /api/vfs                   ← 删除
POST   /api/vfs/trash             ← 移入回收站
```

### 回收站 `/api/trash`

```
GET    /api/trash                 ← 列出
POST   /api/trash/restore         ← 恢复
DELETE /api/trash                 ← 永久删除
```

### 设置 `/api/settings`

```
GET    /api/settings              ← 读取用户设置
PUT    /api/settings              ← 保存用户设置
POST   /api/config/upload         ← 上传配置文件
DELETE /api/config/{key}          ← 删除配置文件
GET    /api/config/{key}          ← 读取配置文件
```

### 聊天 `/api/chat`

```
GET    /api/chat/profiles                 ← 所有用户 profile
GET    /api/chat/profiles/me              ← 当前用户 profile
PUT    /api/chat/profiles/me              ← 更新当前用户 profile
GET    /api/chat/online                   ← 在线用户
GET    /api/chat/conversations             ← 会话列表
POST   /api/chat/conversations             ← 创建/获取私聊
GET    /api/chat/conversations/{id}/messages    ← 消息列表
POST   /api/chat/conversations/{id}/messages    ← 发送消息 (REST)
POST   /api/chat/groups                   ← 创建群聊
POST   /api/chat/groups/{id}/members      ← 添加群成员
POST   /api/chat/upload                   ← 上传聊天文件
POST   /api/chat/cloud-file               ← 发送云文件
GET    /api/chat/download                 ← 下载聊天文件
GET    /api/chat/saved-server             ← 获取保存的服务器配置
PUT    /api/chat/saved-server             ← 保存服务器配置
```

聊天消息发送同时支持 REST 和 WebSocket (`/app/chat.send`)，两条路径均写入 MinIO 并推送给接收者。

### 历史/收藏/传输

```
GET    /api/history               ← 文件历史
POST   /api/history               ← 记录文件访问
GET    /api/favorites             ← 收藏列表
POST   /api/favorites             ← 添加收藏
DELETE /api/favorites             ← 移除收藏
GET    /api/transfers             ← 传输任务列表
PUT    /api/transfers             ← 保存传输任务
```

### 系统信息

```
GET    /api/system/info           ← 系统信息（对象数、存储用量等）
GET    /api/system/device         ← 服务器设备信息
```

---

## 前端改造要点

### API 层

新建 `src/api/` 目录，每个模块导出普通 async 函数：

```typescript
// src/api/client.ts — 封装 fetch，自动附加凭据
// src/api/vfs.ts  — listVfs, createFolder, uploadFile, ...
// src/api/chat.ts — getConversations, sendMessage, ...
```

所有 `invoke('command_name', { args })` 替换为对应 API 函数调用。
所有 `listen('event_name', callback)` 替换为 WebSocket 订阅。

### 凭据管理

- 登录后将 endpoint/accessKey/secretKey 存入 `sessionStorage`
- 前端 `api/client.ts` 从 sessionStorage 读取并附加 `Authorization` header
- 账户列表（已保存的登录信息）加密存入 `localStorage`

### 截图

```javascript
// 替代 xcap
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
// canvas 截帧 → base64
```

### 文件操作

- Tauri dialog → `<input type="file" webkitdirectory>` / `<input type="file" multiple>`
- Tauri 本地路径 → 浏览器 `File` 对象 → multipart 上传
- Tauri 文件下载 → `<a download>` + Blob

---

## 构建与部署

### 开发模式

```
# 终端 1: Spring Boot
cd mos-server && mvn spring-boot:run     # → localhost:8080

# 终端 2: React (Vite HMR)
cd mos-web && npm run dev                # → localhost:5173
```

Vite 配置 proxy：`/api`、`/ws` → `localhost:8080`

### 生产构建

```
cd mos-web && npm run build              # → mos-server/src/main/resources/static/
cd mos-server && mvn package             # → target/mos-server.jar
```

Vite `build.outDir` 指向 `../mos-server/src/main/resources/static`。

### 部署

```
java -jar mos-server.jar --server.port=8080 --minio.endpoint=http://...
```

浏览器访问 `http://host:8080` 即用。Spring Boot 将所有非 `/api/`、`/ws/` 路径 fallback 到 `index.html`。

### application.yml

```yaml
server:
  port: 8080

spring:
  servlet:
    multipart:
      max-file-size: 1024MB
      max-request-size: 1024MB
```

---

## 依赖

### Spring Boot (pom.xml)

- `spring-boot-starter-web`
- `spring-boot-starter-websocket`
- MinIO Java SDK (`io.minio:minio`)
- Jackson (JSON)
- Lombok

### 前端 (package.json)

- 无需新增依赖
- 现有 `@tauri-apps/api`、`@tauri-apps/plugin-*` 可移除

---

## 迁移阶段

| 阶段 | 内容 | 验证标准 |
|------|------|---------|
| 1. 基础设施 | Spring Boot 项目骨架、MinIO/WebSocket 配置、session 管理、前端 API 层 | 能登录、WebSocket 连通 |
| 2. VFS + 设置 | 文件管理器、回收站、设置、系统信息 | 核心桌面功能可用 |
| 3. 聊天 | WebSocket 在线管理、消息收发、文件传输 | 聊天功能完整 |
| 4. 打磨 | 传输面板、历史/收藏、UI 适配、部署打包 | 全功能交付、jar 包可运行 |

---

## 移除的功能

| 功能 | 原因 |
|------|------|
| Redis 连接管理 | 在线状态由 WebSocket 会话管理 |
| Redis heartbeat | WebSocket 连接即心跳 |
| xcap 桌面截图 | 用浏览器 getDisplayMedia 替代 |
| Tauri 原生文件对话框 | HTML5 input 替代 |
| 本地 `accounts.enc` 加密文件 | localStorage 加密存储 |
| `connect_redis`/`disconnect_redis` | 无需 Redis |

---

## 保留不变

- 所有 TypeScript 类型定义
- React 组件 UI 结构
- 桌面 OS 交互模式（窗口管理、任务栏、桌面图标）
- MinIO S3 数据存储格式和路径规范
- 聊天消息和会话的 S3 存储结构
- 用户设置、VFS、回收站的 S3 路径规范
- 图标、壁纸数据
