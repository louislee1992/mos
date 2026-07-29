use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;
use futures_util::StreamExt;
use redis::aio::MultiplexedConnection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::task::JoinHandle;

use crate::bootstrap;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub conv_id: String,
    pub sender: String,
    pub sender_name: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub content: String,
    pub file_name: Option<String>,
    pub file_size: u64,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMeta {
    pub id: String,
    #[serde(rename = "type")]
    pub conv_type: String,
    pub name: Option<String>,
    pub members: Vec<String>,
    pub created_at: i64,
    pub last_message: Option<String>,
    pub last_message_time: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub access_key: String,
    pub nickname: String,
    pub avatar: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RedisConfig {
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RedisStatus {
    pub connected: bool,
    pub host: String,
    pub port: u16,
}

pub struct ChatState {
    pub redis_conn: Mutex<Option<MultiplexedConnection>>,
    pub redis_config: Mutex<Option<RedisConfig>>,
    pub pubsub_handle: Mutex<Option<JoinHandle<()>>>,
    pub heartbeat_handle: Mutex<Option<JoinHandle<()>>>,
    pub current_user: Mutex<String>,
    pub current_bucket: Mutex<String>,
}

fn build_chat_s3(state: &AppState) -> Result<Client, String> {
    let minio = state.minio.lock().map_err(|e| e.to_string())?;
    let cfg = minio.as_ref().ok_or("未登录")?;
    Ok(bootstrap::build_s3_client(
        &cfg.endpoint, &cfg.access_key, &cfg.secret_key,
    ))
}

fn get_bucket(state: &AppState) -> Result<String, String> {
    let minio = state.minio.lock().map_err(|e| e.to_string())?;
    let cfg = minio.as_ref().ok_or("未登录")?;
    Ok(bootstrap::derive_bucket_name(&cfg.access_key))
}

fn get_access_key(state: &AppState) -> Result<String, String> {
    let minio = state.minio.lock().map_err(|e| e.to_string())?;
    let cfg = minio.as_ref().ok_or("未登录")?;
    Ok(cfg.access_key.clone())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64
}

fn chat_prefix() -> &'static str { "mos-chat" }

async fn read_json_from_s3(client: &Client, bucket: &str, key: &str) -> Result<Vec<u8>, String> {
    let resp = client.get_object().bucket(bucket).key(key).send().await
        .map_err(|e| format!("读取 S3 对象失败: {:?}", e))?;
    let data = resp.body.collect().await.map_err(|e| format!("读取响应体失败: {:?}", e))?;
    Ok(data.into_bytes().to_vec())
}

async fn write_json_to_s3(client: &Client, bucket: &str, key: &str, json: &str) -> Result<(), String> {
    client.put_object().bucket(bucket).key(key)
        .body(ByteStream::from(json.as_bytes().to_vec()))
        .send().await.map_err(|e| format!("写入 S3 对象失败: {:?}", e))?;
    Ok(())
}

// ═══════════════════════════════════════════════════════
// Redis connection, heartbeat, and PUB/SUB
// ═══════════════════════════════════════════════════════

fn build_redis_url(cfg: &RedisConfig) -> String {
    match &cfg.password {
        Some(pw) if !pw.is_empty() => format!("redis://:{}@{}:{}/", pw, cfg.host, cfg.port),
        _ => format!("redis://{}:{}/", cfg.host, cfg.port),
    }
}

#[tauri::command]
pub async fn connect_redis(
    app: AppHandle,
    state: State<'_, AppState>,
    chat: State<'_, ChatState>,
    config: RedisConfig,
) -> Result<String, String> {
    let url = build_redis_url(&config);
    let client = redis::Client::open(url.clone()).map_err(|e| format!("Redis 连接失败: {}", e))?;
    let conn = client.get_multiplexed_async_connection().await
        .map_err(|e| format!("Redis 连接失败: {}", e))?;

    let access_key = get_access_key(&state)?;
    let bucket = get_bucket(&state)?;

    *chat.redis_config.lock().map_err(|e| e.to_string())? = Some(config.clone());
    *chat.redis_conn.lock().map_err(|e| e.to_string())? = Some(conn);
    *chat.current_user.lock().map_err(|e| e.to_string())? = access_key.clone();
    *chat.current_bucket.lock().map_err(|e| e.to_string())? = bucket;

    let app_clone = app.clone();
    let pubsub_client = redis::Client::open(url).map_err(|e| format!("Redis 连接失败: {}", e))?;
    let user_key = access_key.clone();
    let handle = tokio::spawn(async move {
        run_pubsub_listener(pubsub_client, app_clone, user_key).await;
    });
    *chat.pubsub_handle.lock().map_err(|e| e.to_string())? = Some(handle);

    let hb_client = redis::Client::open(build_redis_url(&config)).expect("redis url invalid");
    let hb_key = access_key.clone();
    let hb_app = app.clone();
    let hb_handle = tokio::spawn(async move {
        run_heartbeat(hb_client, hb_key, hb_app).await;
    });
    *chat.heartbeat_handle.lock().map_err(|e| e.to_string())? = Some(hb_handle);

    Ok("connected".into())
}

#[allow(deprecated)]
async fn run_pubsub_listener(client: redis::Client, app: AppHandle, current_user: String) {
    let conn = match client.get_async_connection().await { Ok(c) => c, Err(_) => return };
    let mut pubsub = conn.into_pubsub();
    let user_channel = format!("channel:user:{}", current_user);
    if let Err(e) = pubsub.subscribe(&user_channel).await {
        eprintln!("[chat] subscribe {} failed: {:?}", user_channel, e); return;
    }
    if let Err(e) = pubsub.psubscribe("channel:group:*").await {
        eprintln!("[chat] psubscribe failed: {:?}", e); return;
    }
    loop {
        let msg = match pubsub.on_message().next().await {
            Some(msg) => msg,
            None => { eprintln!("[chat] pubsub stream ended"); break; }
        };
        let payload: String = msg.get_payload().unwrap_or_default();
        let _ = app.emit("chat-message", payload);
    }
}

async fn run_heartbeat(client: redis::Client, access_key: String, app: AppHandle) {
    let conn = match client.get_multiplexed_async_connection().await { Ok(c) => c, Err(_) => return };
    let hb_key = format!("heartbeat:{}", access_key);
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(25)).await;
        let mut c = conn.clone();
        let _: Result<(), _> = redis::cmd("SETEX").arg(&hb_key).arg(35i64).arg("1")
            .query_async(&mut c).await;
        let online_keys: Vec<String> = match redis::cmd("SMEMBERS").arg("online:users")
            .query_async(&mut c).await { Ok(k) => k, Err(_) => continue };
        let mut to_remove: Vec<String> = vec![];
        for key in &online_keys {
            let exists: bool = redis::cmd("EXISTS").arg(format!("heartbeat:{}", key))
                .query_async(&mut c).await.unwrap_or(false);
            if !exists { to_remove.push(key.clone()); }
        }
        if !to_remove.is_empty() {
            let _: Result<(), _> = redis::cmd("SREM").arg("online:users").arg(to_remove.clone())
                .query_async(&mut c).await;
            for key in to_remove {
                let _ = app.emit("chat-system", serde_json::json!({
                    "type": "user_offline", "accessKey": key
                }).to_string());
            }
        }
        let _: Result<(), _> = redis::cmd("SADD").arg("online:users").arg(&access_key)
            .query_async(&mut c).await;
    }
}

#[tauri::command]
pub async fn disconnect_redis(chat: State<'_, ChatState>) -> Result<(), String> {
    if let Some(h) = chat.pubsub_handle.lock().map_err(|e| e.to_string())?.take() { h.abort(); }
    if let Some(h) = chat.heartbeat_handle.lock().map_err(|e| e.to_string())?.take() { h.abort(); }
    *chat.redis_conn.lock().map_err(|e| e.to_string())? = None;
    *chat.redis_config.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn get_redis_status(chat: State<'_, ChatState>) -> Result<RedisStatus, String> {
    let cfg = chat.redis_config.lock().map_err(|e| e.to_string())?;
    match cfg.as_ref() {
        Some(c) => Ok(RedisStatus {
            connected: chat.redis_conn.lock().map_err(|e| e.to_string())?.is_some(),
            host: c.host.clone(), port: c.port,
        }),
        None => Ok(RedisStatus { connected: false, host: String::new(), port: 0 }),
    }
}

#[tauri::command]
pub async fn heartbeat(chat: State<'_, ChatState>) -> Result<(), String> {
    let conn = {
        let conn_opt = chat.redis_conn.lock().map_err(|e| e.to_string())?;
        conn_opt.as_ref().ok_or("Redis 未连接")?.clone()
    };
    let access_key = chat.current_user.lock().map_err(|e| e.to_string())?.clone();
    let mut c = conn.clone();
    redis::cmd("SETEX").arg(format!("heartbeat:{}", access_key)).arg(35i64).arg("1")
        .query_async::<_, ()>(&mut c).await.map_err(|e| format!("心跳失败: {}", e))?;
    redis::cmd("SADD").arg("online:users").arg(&access_key)
        .query_async::<_, ()>(&mut c).await.map_err(|e| format!("在线列表更新失败: {}", e))?;
    Ok(())
}

// ═══════════════════════════════════════════════════════
// User profile commands
// ═══════════════════════════════════════════════════════

#[tauri::command]
pub async fn get_user_profile(
    state: State<'_, AppState>, access_key: String,
) -> Result<UserProfile, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let key = format!("{}/profiles/{}.json", chat_prefix(), access_key);
    match read_json_from_s3(&client, &bucket, &key).await {
        Ok(data) => serde_json::from_slice(&data).map_err(|e| format!("解析失败: {}", e)),
        Err(_) => Ok(UserProfile {
            access_key: access_key.clone(), nickname: access_key.clone(),
            avatar: None, created_at: 0,
        }),
    }
}

#[tauri::command]
pub async fn update_user_profile(
    state: State<'_, AppState>, chat: State<'_, ChatState>,
    nickname: String, avatar: Option<String>,
) -> Result<(), String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let access_key = chat.current_user.lock().map_err(|e| e.to_string())?.clone();
    let profile = UserProfile {
        access_key: access_key.clone(), nickname, avatar, created_at: now_ms(),
    };
    let json = serde_json::to_string(&profile).map_err(|e| format!("序列化失败: {}", e))?;
    write_json_to_s3(&client, &bucket,
        &format!("{}/profiles/{}.json", chat_prefix(), access_key), &json).await
}

#[tauri::command]
pub async fn get_online_users(
    chat: State<'_, ChatState>, state: State<'_, AppState>,
) -> Result<Vec<UserProfile>, String> {
    let mut c = {
        let conn_opt = chat.redis_conn.lock().map_err(|e| e.to_string())?;
        conn_opt.as_ref().ok_or("Redis 未连接")?.clone()
    };
    let online_keys: Vec<String> = redis::cmd("SMEMBERS").arg("online:users")
        .query_async(&mut c).await.map_err(|e| format!("获取在线用户失败: {}", e))?;
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let mut users = vec![];
    for key in online_keys {
        let pk = format!("{}/profiles/{}.json", chat_prefix(), key);
        let profile = match read_json_from_s3(&client, &bucket, &pk).await {
            Ok(data) => serde_json::from_slice(&data).unwrap_or(UserProfile {
                access_key: key.clone(), nickname: key.clone(), avatar: None, created_at: 0,
            }),
            Err(_) => UserProfile {
                access_key: key.clone(), nickname: key.clone(), avatar: None, created_at: 0,
            },
        };
        users.push(profile);
    }
    Ok(users)
}

#[tauri::command]
pub async fn get_online_access_keys(chat: State<'_, ChatState>) -> Result<Vec<String>, String> {
    let mut c = {
        let conn_opt = chat.redis_conn.lock().map_err(|e| e.to_string())?;
        conn_opt.as_ref().ok_or("Redis 未连接")?.clone()
    };
    redis::cmd("SMEMBERS").arg("online:users").query_async(&mut c).await
        .map_err(|e| format!("获取在线用户失败: {}", e))
}

#[tauri::command]
pub async fn list_chat_profiles(state: State<'_, AppState>) -> Result<Vec<UserProfile>, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let prefix = format!("{}/profiles/", chat_prefix());
    let resp = client.list_objects_v2().bucket(&bucket).prefix(&prefix).send().await
        .map_err(|e| format!("列出 Profile 失败: {:?}", e))?;
    let mut profiles = vec![];
    for obj in resp.contents() {
        let key = obj.key().unwrap_or_default().to_string();
        if !key.ends_with(".json") { continue; }
        if let Ok(data) = read_json_from_s3(&client, &bucket, &key).await {
            if let Ok(p) = serde_json::from_slice::<UserProfile>(&data) { profiles.push(p); }
        }
    }
    Ok(profiles)
}

// ═══════════════════════════════════════════════════════
// Message and conversation commands
// ═══════════════════════════════════════════════════════

fn make_private_conv_id(user_a: &str, user_b: &str) -> String {
    let mut keys = vec![user_a.to_string(), user_b.to_string()];
    keys.sort();
    format!("conv_{}_{}", keys[0], keys[1])
}

#[tauri::command]
pub async fn get_or_create_private_conv(
    state: State<'_, AppState>, chat: State<'_, ChatState>, other_user: String,
) -> Result<ConversationMeta, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let current = chat.current_user.lock().map_err(|e| e.to_string())?.clone();
    let conv_id = make_private_conv_id(&current, &other_user);
    let members_key = format!("{}/conversations/{}_members.json", chat_prefix(), conv_id);
    match read_json_from_s3(&client, &bucket, &members_key).await {
        Ok(data) => {
            let meta = serde_json::from_slice::<ConversationMeta>(&data)
                .unwrap_or(ConversationMeta {
                    id: conv_id.clone(), conv_type: "private".into(), name: None,
                    members: vec![current.clone(), other_user],
                    created_at: now_ms(), last_message: None, last_message_time: 0,
                });
            Ok(meta)
        }
        Err(_) => {
            let meta = ConversationMeta {
                id: conv_id.clone(), conv_type: "private".into(), name: None,
                members: vec![current, other_user],
                created_at: now_ms(), last_message: None, last_message_time: 0,
            };
            let json = serde_json::to_string(&meta).map_err(|e| e.to_string())?;
            write_json_to_s3(&client, &bucket, &members_key, &json).await?;
            Ok(meta)
        }
    }
}

#[tauri::command]
pub async fn get_conversations(
    state: State<'_, AppState>, chat: State<'_, ChatState>,
) -> Result<Vec<ConversationMeta>, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let prefix = format!("{}/conversations/", chat_prefix());
    let current = chat.current_user.lock().map_err(|e| e.to_string())?.clone();
    let resp = client.list_objects_v2().bucket(&bucket).prefix(&prefix).send().await
        .map_err(|e| format!("列出会话失败: {:?}", e))?;
    let mut convs: Vec<ConversationMeta> = vec![];
    for obj in resp.contents() {
        let key = obj.key().unwrap_or_default().to_string();
        if !key.ends_with("_members.json") { continue; }
        if let Ok(data) = read_json_from_s3(&client, &bucket, &key).await {
            if let Ok(meta) = serde_json::from_slice::<ConversationMeta>(&data) {
                if meta.members.contains(&current) { convs.push(meta); }
            }
        }
    }
    convs.sort_by_key(|c| -(c.last_message_time));
    Ok(convs)
}

#[tauri::command]
pub async fn load_conversation(
    state: State<'_, AppState>, conv_id: String,
) -> Result<Vec<ChatMessage>, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let msg_key = format!("{}/conversations/{}.json", chat_prefix(), conv_id);
    match read_json_from_s3(&client, &bucket, &msg_key).await {
        Ok(data) => Ok(serde_json::from_slice(&data).unwrap_or_default()),
        Err(_) => Ok(vec![]),
    }
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle, state: State<'_, AppState>, chat: State<'_, ChatState>,
    conv_id: String, content: String, msg_type: String,
    file_name: Option<String>, file_size: Option<u64>,
) -> Result<ChatMessage, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let sender = chat.current_user.lock().map_err(|e| e.to_string())?.clone();
    let sender_name = {
        let pk = format!("{}/profiles/{}.json", chat_prefix(), sender);
        match read_json_from_s3(&client, &bucket, &pk).await {
            Ok(data) => serde_json::from_slice::<UserProfile>(&data)
                .map(|p| p.nickname).unwrap_or(sender.clone()),
            Err(_) => sender.clone(),
        }
    };
    let msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(), conv_id: conv_id.clone(),
        sender: sender.clone(), sender_name,
        msg_type: msg_type.clone(), content: content.clone(),
        file_name: file_name.clone(), file_size: file_size.unwrap_or(0),
        timestamp: now_ms(),
    };
    let msg_key = format!("{}/conversations/{}.json", chat_prefix(), conv_id);
    let mut existing: Vec<ChatMessage> = match read_json_from_s3(&client, &bucket, &msg_key).await {
        Ok(data) => serde_json::from_slice(&data).unwrap_or_default(),
        Err(_) => vec![],
    };
    existing.push(msg.clone());
    let json = serde_json::to_string(&existing).map_err(|e| format!("序列化失败: {}", e))?;
    write_json_to_s3(&client, &bucket, &msg_key, &json).await?;
    let members_key = format!("{}/conversations/{}_members.json", chat_prefix(), conv_id);
    let (conv_type, members) = match read_json_from_s3(&client, &bucket, &members_key).await {
        Ok(data) => {
            let mut meta = match serde_json::from_slice::<ConversationMeta>(&data) {
                Ok(m) => m,
                Err(_) => return Ok(msg),
            };
            meta.last_message = Some(if msg_type == "text" || msg_type == "emoji" {
                content.clone()
            } else if msg_type == "image" { "[图片]".into() }
            else if msg_type == "file" { format!("[文件] {}", file_name.unwrap_or_default()) }
            else { content.clone() });
            meta.last_message_time = msg.timestamp;
            let conv_type = meta.conv_type.clone();
            let members = meta.members.clone();
            let meta_json = serde_json::to_string(&meta).map_err(|e| e.to_string())?;
            write_json_to_s3(&client, &bucket, &members_key, &meta_json).await?;
            (conv_type, members)
        }
        Err(_) => return Ok(msg),
    };
    let msg_json = serde_json::to_string(&msg).map_err(|e| format!("序列化失败: {}", e))?;
    let mut c = {
        let conn_opt = chat.redis_conn.lock().map_err(|e| e.to_string())?;
        match conn_opt.as_ref() {
            Some(conn) => conn.clone(),
            None => {
                let _ = app.emit("chat-message", serde_json::to_string(&msg).unwrap_or_default());
                return Ok(msg);
            }
        }
    };
    if conv_type == "private" {
        for member in &members {
            if *member != sender {
                let _: Result<(), _> = redis::cmd("PUBLISH")
                    .arg(format!("channel:user:{}", member)).arg(&msg_json)
                    .query_async(&mut c).await;
            }
        }
    } else {
        let _: Result<(), _> = redis::cmd("PUBLISH")
            .arg(format!("channel:group:{}", conv_id)).arg(&msg_json)
            .query_async(&mut c).await;
    }
    let _ = app.emit("chat-message", serde_json::to_string(&msg).unwrap_or_default());
    Ok(msg)
}

#[tauri::command]
pub async fn create_group(
    state: State<'_, AppState>, chat: State<'_, ChatState>,
    name: String, member_keys: Vec<String>,
) -> Result<ConversationMeta, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let current = chat.current_user.lock().map_err(|e| e.to_string())?.clone();
    let mut members = member_keys.clone();
    if !members.contains(&current) { members.push(current.clone()); }
    let conv_id = format!("conv_{}", uuid::Uuid::new_v4());
    let meta = ConversationMeta {
        id: conv_id.clone(), conv_type: "group".into(), name: Some(name), members,
        created_at: now_ms(), last_message: None, last_message_time: now_ms(),
    };
    let members_key = format!("{}/conversations/{}_members.json", chat_prefix(), conv_id);
    let json = serde_json::to_string(&meta).map_err(|e| format!("序列化失败: {}", e))?;
    write_json_to_s3(&client, &bucket, &members_key, &json).await?;
    write_json_to_s3(&client, &bucket,
        &format!("{}/conversations/{}.json", chat_prefix(), conv_id), "[]").await?;
    let mut c = {
        let conn_opt = chat.redis_conn.lock().map_err(|e| e.to_string())?;
        match conn_opt.as_ref() {
            Some(conn) => conn.clone(),
            None => return Ok(meta),
        }
    };
    let sys_msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(), "convId": conv_id,
        "sender": current, "senderName": "系统", "type": "system",
        "content": "群聊已创建", "fileName": null, "fileSize": 0, "timestamp": now_ms()
    });
    let payload = serde_json::to_string(&sys_msg).unwrap_or_default();
    for member in &meta.members {
        if *member == current { continue; }
        let _: Result<(), _> = redis::cmd("PUBLISH")
            .arg(format!("channel:user:{}", member)).arg(&payload)
            .query_async(&mut c).await;
    }
    Ok(meta)
}

#[tauri::command]
pub async fn add_group_members(
    state: State<'_, AppState>, chat: State<'_, ChatState>,
    conv_id: String, member_keys: Vec<String>,
) -> Result<(), String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let members_key = format!("{}/conversations/{}_members.json", chat_prefix(), conv_id);
    let data = read_json_from_s3(&client, &bucket, &members_key).await?;
    let mut meta: ConversationMeta = serde_json::from_slice(&data)
        .map_err(|e| format!("解析失败: {}", e))?;
    for key in &member_keys { if !meta.members.contains(key) { meta.members.push(key.clone()); } }
    let json = serde_json::to_string(&meta).map_err(|e| format!("序列化失败: {}", e))?;
    write_json_to_s3(&client, &bucket, &members_key, &json).await?;
    let current = chat.current_user.lock().map_err(|e| e.to_string())?.clone();
    let mut c = {
        let conn_opt = chat.redis_conn.lock().map_err(|e| e.to_string())?;
        match conn_opt.as_ref() {
            Some(conn) => conn.clone(),
            None => return Ok(()),
        }
    };
    let sys_msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(), "convId": conv_id,
        "sender": current, "senderName": "系统", "type": "system",
        "content": format!("新成员加入: {}", member_keys.join(", ")),
        "fileName": null, "fileSize": 0, "timestamp": now_ms()
    });
    let payload = serde_json::to_string(&sys_msg).unwrap_or_default();
    for member in &meta.members {
        let _: Result<(), _> = redis::cmd("PUBLISH")
            .arg(format!("channel:user:{}", member)).arg(&payload)
            .query_async(&mut c).await;
    }
    Ok(())
}

// ═══════════════════════════════════════════════════════
// Screenshot, file upload, and cloud file commands
// ═══════════════════════════════════════════════════════

#[tauri::command]
pub async fn capture_screenshot(app: AppHandle) -> Result<String, String> {
    let _ = app.emit("chat-hide-windows", ());
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    let monitors = xcap::Monitor::all().map_err(|e| format!("获取显示器失败: {}", e))?;
    let monitor = monitors.into_iter().next().ok_or("没有显示器")?;
    let image = monitor.capture_image().map_err(|e| format!("截图失败: {}", e))?;
    let _ = app.emit("chat-show-windows", ());
    let mut png = vec![];
    let encoder = image::codecs::png::PngEncoder::new(&mut png);
    image.write_with_encoder(encoder).map_err(|e| format!("PNG编码失败: {}", e))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
pub async fn upload_chat_file(
    state: State<'_, AppState>, conv_id: String, local_path: String,
) -> Result<String, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let file_name = std::path::Path::new(&local_path).file_name()
        .map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
    let msg_id = uuid::Uuid::new_v4().to_string();
    let s3_key = format!("{}/files/{}/{}_{}", chat_prefix(), conv_id, msg_id, file_name);
    let data = tokio::fs::read(&local_path).await.map_err(|e| format!("读取失败: {}", e))?;
    client.put_object().bucket(&bucket).key(&s3_key).body(ByteStream::from(data))
        .send().await.map_err(|e| format!("上传失败: {:?}", e))?;
    Ok(s3_key)
}

#[tauri::command]
pub async fn send_cloud_file(
    state: State<'_, AppState>, conv_id: String, vfs_path: String, file_name: String,
) -> Result<String, String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let msg_id = uuid::Uuid::new_v4().to_string();
    let s3_key = format!("{}/files/{}/{}_{}", chat_prefix(), conv_id, msg_id, file_name);
    client.copy_object().bucket(&bucket).key(&s3_key)
        .copy_source(format!("{}/vfs/{}", bucket, vfs_path))
        .send().await.map_err(|e| format!("复制失败: {:?}", e))?;
    Ok(s3_key)
}

#[tauri::command]
pub async fn download_chat_file(
    state: State<'_, AppState>, s3_key: String, local_path: String,
) -> Result<(), String> {
    let client = build_chat_s3(&state)?;
    let bucket = get_bucket(&state)?;
    let resp = client.get_object().bucket(&bucket).key(&s3_key).send().await
        .map_err(|e| format!("下载失败: {:?}", e))?;
    let data = resp.body.collect().await.map_err(|e| format!("读取失败: {:?}", e))?;
    tokio::fs::write(&local_path, data.into_bytes()).await
        .map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}
