# 网盘文件分享设计

日期：2026-08-14

## 背景

聊天中需要支持分享网盘文件：发送者在聊天框中选择网盘文件分享给会话成员，接收者消息中可直接下载，文件自动出现在文件管理器的"他人共享"列表，并可转存到自己的网盘目录。发送者在"我的共享"中查看分享记录与剩余天数。

## 核心机制

- **MinIO presigned URL 直连原文件**：下载不经服务端转发，URL 有效期 = 分享过期时间
- **仅支持单个文件**：文件夹不可直接分享，用户需先自行打包（zip 等）后再分享
- **无取消分享**：分享状态由过期时间自动决定；presigned URL 无法吊销，故不提供取消
- 分享记录存服务端文件系统（复用 `LocalChatStore`，前缀 `mos-share/`，与聊天数据同机制）

## 数据模型

分享记录 `ShareRecord`（JSON 文件 `mos-share/{shareId}.json`）：

| 字段 | 说明 |
|------|------|
| shareId | UUID |
| owner | 分享者 accessKey |
| vfsPath | 分享者网盘中的源文件路径 |
| name | 文件名 |
| size | 文件大小 |
| receivers | 接收者 accessKey 列表（= 会话其他成员） |
| createdAt | 创建时间戳 |
| expiresAt | 过期时间戳（创建时按天数计算） |

无 status 字段：是否过期由 `expiresAt` 与当前时间比较得出。

## 后端接口（`/api/share`，新建 ShareController + ShareService）

| 接口 | 说明 |
|------|------|
| `POST /api/share` body: `{vfsPath, days, convId}` | 校验源文件存在、convId 成员关系；写记录；对源对象生成 presigned URL；返回 `{shareId, url, name, size, expiresAt}` |
| `GET /api/share/mine` | 我创建的分享列表（含 name/size/expiresAt/剩余天数；不返回 URL） |
| `GET /api/share/received` | 我收到的分享列表（对每个未过期条目动态生成 presigned URL） |
| `POST /api/share/{id}/save` body: `{destPath}` | 转存：把源对象从分享者 bucket 复制到我的 bucket 的 `vfs/{destPath}`；目标存在则报错不覆盖 |
| `DELETE /api/share/{id}` | 发送者删除自己的分享记录（过期条目清理） |
| `POST /api/share/{id}/dismiss` | 接收者把自己从 receivers 移除（过期条目从"他人共享"清除） |

说明：
- 所有接口按 accessKey 校验权限：mine 仅 owner 可见；received 仅 receivers 成员可见；save/dismiss 仅 receivers 成员可用
- presigned URL 每次在 received 列表接口动态生成（MinIO SDK 本地签名，无状态），过期条目不生成
- 转存使用 MinIO CopySource 跨 bucket 复制；源对象被删除则转存报错提示

## 聊天消息集成

- 新消息类型 `share`：`content` = shareId，`fileName` = 文件名，`fileSize` = 大小
- 发送流程（ChatView）：工具栏"发送网盘文件"→ 弹框选择文件 + 过期天数 → `POST /api/share` → 拿 shareId 走现有 `sendMessage(convId, shareId, 'share', name, size)` → 现有 WebSocket 推送机制自动送达会话成员
- 前端收到 share 消息：刷新"他人共享"列表（无需新事件，复用消息触发刷新）
- 消息卡片渲染（ChatView）：卡片数据源 = "他人共享"列表（发送者侧 = 创建分享时的响应数据）中按 shareId 匹配的条目；匹配不到则显示"分享已失效"
  - 所有人：文件图标、名称、大小、过期时间/剩余天数
  - 接收者（`msg.sender !== currentUserKey`）：下载、转存按钮
  - 发送者：无操作按钮
  - 已过期（按 expiresAt 判断）：置灰显示"已失效"
- `previewOf` 对 share 类型显示 `[分享] 文件名`

## 前端组件

1. **发送弹框**（ChatView 内新组件 `ShareFileModal`）：展示自己网盘的文件树（复用 VFS 列表接口），文件夹可进入不可选中（置灰，提示"请先打包文件夹"）；单选文件；过期天数下拉（1/3/7/30，默认 7）；确认发送
2. **消息卡片**：见上节
3. **FileManager · 我的共享**（现有 `my-shares` 导航空壳填充）：表格列 = 名称、类型、大小、共享天数、过期时间、剩余天数、操作；未过期无操作按钮；过期条目置灰 + "删除"按钮（`DELETE /api/share/{id}`）
4. **FileManager · 他人共享**（现有 `shared-others` 导航空壳填充）：表格列 = 名称、类型、大小、分享者、过期时间、操作；未过期：下载（打开 presigned URL）、转存（弹出目录选择）；过期条目置灰 + "删除"按钮（`dismiss`）
5. **转存目录选择弹框**：展示自己网盘的目录树（仅文件夹可选），确认后调 `save` 接口，成功后 toast 提示
6. 切换导航到共享页时加载对应列表（沿用 recent/favorites 的加载模式）

## 错误处理

| 场景 | 处理 |
|------|------|
| 分享源文件不存在 | 弹框提示失败，不发送消息 |
| 原文件被删除后下载 | MinIO 404，前端提示"分享已失效" |
| 转存目标路径冲突 | 报错提示，不覆盖 |
| 转存时源文件已删除 | 报错提示"源文件已不存在" |
| presigned URL 过期后点击下载 | 提示"分享已过期" |
| 过期条目 | 不过滤，置灰禁用操作，仅保留删除按钮 |

## 范围外

- 文件夹分享（需用户先自行打包）
- 取消分享（presigned URL 无法吊销）
- 分享给非会话成员
- 分享链接外传（仅会话接收者可见）
- 服务端自动打包/解压

## 验证（手动，项目无测试框架）

1. A 与 B 私聊：A 点"发送网盘文件"→ 选文件、7 天 → B 收到卡片消息，可下载；B 打开文件管理器"他人共享"看到条目，转存到指定目录后文件出现在自己网盘
2. A 打开"我的共享"看到记录与剩余天数
3. 群聊 A/B/C：A 分享 → B、C 均收到消息且"他人共享"出现条目
4. 过期条目：置灰不可操作，删除按钮生效后条目消失
5. 文件夹在发送弹框中置灰不可选
