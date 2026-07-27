use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const SHA256_BLOCK_SIZE: usize = 64;
const BASE36: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub app_id: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub version: u32,
    pub updated_at: i64,
    pub wallpaper_id: String,
    pub desktop_icon_order: Vec<String>,
    pub theme: String,
    pub open_windows: Vec<WindowState>,
}

impl UserSettings {
    fn default_config() -> Self {
        Self {
            version: 1,
            updated_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64,
            wallpaper_id: "default".into(),
            desktop_icon_order: vec!["file-manager".into(), "recycle-bin".into()],
            theme: "dark".into(),
            open_windows: vec![],
        }
    }
}

fn derive_bucket_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"com.mos.app.bucket.v1");
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut key_bytes = [0u8; SHA256_BLOCK_SIZE];

    if key.len() > SHA256_BLOCK_SIZE {
        let hashed = Sha256::digest(key);
        key_bytes[..32].copy_from_slice(&hashed);
    } else {
        key_bytes[..key.len()].copy_from_slice(key);
    }

    let mut i_key_pad = [0u8; SHA256_BLOCK_SIZE];
    let mut o_key_pad = [0u8; SHA256_BLOCK_SIZE];
    for i in 0..SHA256_BLOCK_SIZE {
        i_key_pad[i] = key_bytes[i] ^ 0x36;
        o_key_pad[i] = key_bytes[i] ^ 0x5c;
    }

    let inner_hash = {
        let mut hasher = Sha256::new();
        hasher.update(&i_key_pad);
        hasher.update(message);
        hasher.finalize()
    };

    let mut hasher = Sha256::new();
    hasher.update(&o_key_pad);
    hasher.update(&inner_hash);
    let result = hasher.finalize();
    let mut output = [0u8; 32];
    output.copy_from_slice(&result);
    output
}

fn base36_encode(bytes: &[u8]) -> String {
    let mut num = 0u128;
    for &b in bytes {
        num = (num << 8) | b as u128;
    }
    if num == 0 {
        return "0".into();
    }
    let mut chars = Vec::new();
    while num > 0 {
        chars.push(BASE36[(num % 36) as usize] as char);
        num /= 36;
    }
    chars.reverse();
    chars.into_iter().collect()
}

pub fn derive_bucket_name(access_key: &str) -> String {
    let key = derive_bucket_key();
    let mac = hmac_sha256(&key, access_key.as_bytes());
    base36_encode(&mac[..8])
}

fn build_s3_client(endpoint: &str, access_key: &str, secret_key: &str) -> Client {
    let creds = Credentials::new(access_key, secret_key, None, None, "minio");
    let config = aws_sdk_s3::Config::builder()
        .credentials_provider(creds)
        .endpoint_url(endpoint)
        .region(Region::new("us-east-1"))
        .force_path_style(true)
        .behavior_version(BehaviorVersion::latest())
        .build();
    Client::from_conf(config)
}

#[tauri::command]
pub async fn bootstrap_user_bucket(
    state: State<'_, crate::AppState>,
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

    match client.create_bucket().bucket(&bucket).send().await {
        Ok(_) => println!("[bootstrap] bucket created: {}", bucket),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("BucketAlreadyOwnedByYou") || msg.contains("BucketAlreadyExists") {
                println!("[bootstrap] bucket exists: {}", bucket);
            } else {
                return Err(format!("创建桶失败: {}", msg));
            }
        }
    }

    let config_result = match client
        .get_object()
        .bucket(&bucket)
        .key("config/settings.json")
        .send()
        .await
    {
        Ok(resp) => {
            let bytes = resp
                .body
                .collect()
                .await
                .map_err(|e| format!("读取配置失败: {}", e))?;
            let json =
                String::from_utf8(bytes.to_vec()).map_err(|e| format!("配置编码错误: {}", e))?;
            if serde_json::from_str::<UserSettings>(&json).is_err() {
                println!("[bootstrap] config corrupt, replacing with default");
                let settings = UserSettings::default_config();
                let default_json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
                client
                    .put_object()
                    .bucket(&bucket)
                    .key("config/settings.json")
                    .body(default_json.as_bytes().to_vec().into())
                    .send()
                    .await
                    .map_err(|e| format!("写入默认配置失败: {}", e))?;
                Ok(default_json)
            } else {
                Ok(json)
            }
        }
        Err(_) => {
            let settings = UserSettings::default_config();
            let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
            client
                .put_object()
                .bucket(&bucket)
                .key("config/settings.json")
                .body(json.as_bytes().to_vec().into())
                .send()
                .await
                .map_err(|e| format!("写入默认配置失败: {}", e))?;
            println!(
                "[bootstrap] default config written to {}/config/settings.json",
                bucket
            );
            Ok(json)
        }
    };

    // ensure vfs/ directory exists
    match client
        .head_object()
        .bucket(&bucket)
        .key("vfs/")
        .send()
        .await
    {
        Ok(_) => println!("[bootstrap] vfs/ exists"),
        Err(_) => {
            client
                .put_object()
                .bucket(&bucket)
                .key("vfs/")
                .body(vec![].into())
                .send()
                .await
                .map_err(|e| format!("创建 vfs 目录失败: {}", e))?;
            println!("[bootstrap] vfs/ created");
        }
    }

    config_result
}

#[tauri::command]
pub async fn ensure_vfs(
    state: State<'_, crate::AppState>,
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

    match client
        .head_object()
        .bucket(&bucket)
        .key("vfs/")
        .send()
        .await
    {
        Ok(_) => println!("[ensure_vfs] vfs/ exists"),
        Err(_) => {
            client
                .put_object()
                .bucket(&bucket)
                .key("vfs/")
                .body(vec![].into())
                .send()
                .await
                .map_err(|e| format!("创建 vfs 目录失败: {}", e))?;
            println!("[ensure_vfs] vfs/ created");
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn save_user_settings(
    state: State<'_, crate::AppState>,
    settings_json: String,
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

    let mut settings: UserSettings =
        serde_json::from_str(&settings_json).map_err(|e| format!("配置 JSON 无效: {}", e))?;
    settings.updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;

    let client = build_s3_client(&endpoint, &access_key, &secret_key);
    let bucket = derive_bucket_name(&access_key);

    client
        .put_object()
        .bucket(&bucket)
        .key("config/settings.json")
        .body(json.as_bytes().to_vec().into())
        .send()
        .await
        .map_err(|e| format!("保存配置失败: {}", e))?;
    println!(
        "[bootstrap] settings saved to {}/config/settings.json",
        bucket
    );
    Ok(())
}

// ── VFS ────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VfsEntry {
    pub name: String,
    pub is_directory: bool,
    pub size: i64,
    pub modified_at: String,
    pub children: Vec<VfsEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub name: String,
    pub original_path: String,
    pub is_directory: bool,
    pub size: i64,
    pub deleted_at: String,
    pub trash_key: String,
}

fn insert_vfs_path(
    children: &mut Vec<VfsEntry>,
    segments: &[&str],
    is_dir: bool,
    size: i64,
    modified_at: &str,
) {
    if segments.is_empty() {
        return;
    }
    let name = segments[0].to_string();
    if let Some(node) = children.iter_mut().find(|c| c.name == name) {
        if segments.len() > 1 {
            node.is_directory = true;
            insert_vfs_path(&mut node.children, &segments[1..], is_dir, size, modified_at);
        } else if is_dir {
            node.is_directory = true;
        } else {
            node.size = size;
            node.modified_at = modified_at.to_string();
        }
    } else {
        let mut node = VfsEntry {
            name,
            is_directory: is_dir && segments.len() == 1,
            size: if segments.len() == 1 && !is_dir { size } else { 0 },
            modified_at: if segments.len() == 1 && !is_dir { modified_at.to_string() } else { String::new() },
            children: vec![],
        };
        if segments.len() > 1 {
            node.is_directory = true;
            insert_vfs_path(&mut node.children, &segments[1..], is_dir, size, modified_at);
        }
        children.push(node);
    }
}

fn sort_vfs_entries(entries: &mut [VfsEntry]) {
    entries.sort_by(|a, b| {
        if a.is_directory != b.is_directory {
            b.is_directory.cmp(&a.is_directory)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    for entry in entries.iter_mut() {
        sort_vfs_entries(&mut entry.children);
    }
}

#[tauri::command]
pub async fn list_vfs(
    state: State<'_, crate::AppState>,
) -> Result<Vec<VfsEntry>, String> {
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

    let resp = client
        .list_objects_v2()
        .bucket(&bucket)
        .prefix("vfs/")
        .send()
        .await
        .map_err(|e| format!("列出 vfs 失败: {}", e))?;

    let mut children: Vec<VfsEntry> = vec![];
    for obj in resp.contents() {
        let key = obj.key().unwrap_or("");
        if key == "vfs/" {
            continue;
        }
        let relative = key.strip_prefix("vfs/").unwrap_or(key);
        if relative.is_empty() {
            continue;
        }
        let is_dir = relative.ends_with('/');
        let trimmed = if is_dir {
            &relative[..relative.len() - 1]
        } else {
            relative
        };
        let size = obj.size().unwrap_or(0);
        let modified_at = obj
            .last_modified()
            .map(|dt| {
                let s = dt.to_string();
                // truncate to "YYYY-MM-DDTHH:MM:SS"
                if s.len() >= 19 { s[..19].to_string() } else { s }
            })
            .unwrap_or_default();
        let segments: Vec<&str> = trimmed.split('/').collect();
        insert_vfs_path(&mut children, &segments, is_dir, size, &modified_at);
    }
    sort_vfs_entries(&mut children);
    Ok(children)
}

#[tauri::command]
pub async fn create_vfs_folder(
    state: State<'_, crate::AppState>,
    path: String,
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
    let key = format!("vfs/{}/", path.trim_end_matches('/'));

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(vec![].into())
        .send()
        .await
        .map_err(|e| format!("创建文件夹失败: {}", e))?;
    println!("[vfs] folder created: {}", key);
    Ok(())
}

#[tauri::command]
pub async fn create_vfs_file(
    state: State<'_, crate::AppState>,
    path: String,
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
        .body(vec![].into())
        .send()
        .await
        .map_err(|e| format!("创建文件失败: {}", e))?;
    println!("[vfs] file created: {}", key);
    Ok(())
}

#[tauri::command]
pub async fn upload_vfs_file(
    state: State<'_, crate::AppState>,
    local_path: String,
    vfs_folder: String,
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

    let data = tokio::fs::read(&local_path)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let filename = std::path::Path::new(&local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let client = build_s3_client(&endpoint, &access_key, &secret_key);
    let bucket = derive_bucket_name(&access_key);
    let key = format!("vfs/{}/{}", vfs_folder.trim_end_matches('/'), filename);

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(data.into())
        .send()
        .await
        .map_err(|e| format!("上传文件失败: {}", e))?;
    println!("[vfs] uploaded: {}", key);
    Ok(())
}

#[tauri::command]
pub async fn upload_vfs_folder(
    state: State<'_, crate::AppState>,
    local_dir: String,
    vfs_folder: String,
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
    let base = std::path::Path::new(&local_dir);

    if !base.is_dir() {
        return Err("路径不是目录".into());
    }

    let prefix = format!("vfs/{}", vfs_folder.trim_end_matches('/'));
    let prefix = prefix.trim_end_matches('/');

    let mut entries = tokio::fs::read_dir(base)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            let sub_key = format!("{}/{}/", prefix, name);
            client
                .put_object()
                .bucket(&bucket)
                .key(&sub_key)
                .body(vec![].into())
                .send()
                .await
                .map_err(|e| format!("创建子目录失败: {}", e))?;
            Box::pin(upload_vfs_folder_helper(
                &client, &bucket, &path, &sub_key,
            ))
            .await?;
        } else if path.is_file() {
            let data = tokio::fs::read(&path)
                .await
                .map_err(|e| format!("读取文件 {} 失败: {}", name, e))?;
            let key = format!("{}/{}", prefix, name);
            client
                .put_object()
                .bucket(&bucket)
                .key(&key)
                .body(data.into())
                .send()
                .await
                .map_err(|e| format!("上传 {} 失败: {}", name, e))?;
            println!("[vfs] uploaded: {}", key);
        }
    }

    // ensure the folder itself exists as a prefix
    let folder_key = format!("{}/", prefix);
    if client
        .head_object()
        .bucket(&bucket)
        .key(&folder_key)
        .send()
        .await
        .is_err()
    {
        client
            .put_object()
            .bucket(&bucket)
            .key(&folder_key)
            .body(vec![].into())
            .send()
            .await
            .map_err(|e| format!("创建文件夹失败: {}", e))?;
    }

    Ok(())
}

async fn upload_vfs_folder_helper(
    client: &Client,
    bucket: &str,
    local: &std::path::Path,
    vfs_prefix: &str,
) -> Result<(), String> {
    let mut entries = tokio::fs::read_dir(local)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            let sub_key = format!("{}{}/", vfs_prefix, name);
            client
                .put_object()
                .bucket(bucket)
                .key(&sub_key)
                .body(vec![].into())
                .send()
                .await
                .map_err(|e| format!("创建子目录失败: {}", e))?;
            Box::pin(upload_vfs_folder_helper(client, bucket, &path, &sub_key)).await?;
        } else if path.is_file() {
            let data = tokio::fs::read(&path)
                .await
                .map_err(|e| format!("读取文件 {} 失败: {}", name, e))?;
            let key = format!("{}{}", vfs_prefix, name);
            client
                .put_object()
                .bucket(bucket)
                .key(&key)
                .body(data.into())
                .send()
                .await
                .map_err(|e| format!("上传 {} 失败: {}", name, e))?;
            println!("[vfs] uploaded: {}", key);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_vfs(
    state: State<'_, crate::AppState>,
    path: String,
    is_directory: bool,
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

    if is_directory {
        let prefix = format!("vfs/{}/", path.trim_end_matches('/'));
        loop {
            let resp = client
                .list_objects_v2()
                .bucket(&bucket)
                .prefix(&prefix)
                .send()
                .await
                .map_err(|e| format!("列出对象失败: {}", e))?;

            let objects: Vec<_> = resp
                .contents()
                .iter()
                .filter_map(|o| o.key().map(|k| k.to_string()))
                .collect();

            if objects.is_empty() {
                break;
            }

            for key in &objects {
                client
                    .delete_object()
                    .bucket(&bucket)
                    .key(key)
                    .send()
                    .await
                    .map_err(|e| format!("删除 {} 失败: {}", key, e))?;
            }
        }
    } else {
        let key = format!("vfs/{}", path.trim_start_matches('/'));
        client
            .delete_object()
            .bucket(&bucket)
            .key(&key)
            .send()
            .await
            .map_err(|e| format!("删除文件失败: {}", e))?;
    }

    println!("[vfs] deleted: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn move_vfs_to_trash(
    state: State<'_, crate::AppState>,
    path: String,
    is_directory: bool,
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

    // ensure trash/ marker exists
    if client
        .head_object()
        .bucket(&bucket)
        .key("trash/")
        .send()
        .await
        .is_err()
    {
        client
            .put_object()
            .bucket(&bucket)
            .key("trash/")
            .body(vec![].into())
            .send()
            .await
            .map_err(|e| format!("创建 trash 目录失败: {}", e))?;
    }

    if is_directory {
        let prefix = format!("vfs/{}/", path.trim_end_matches('/'));
        loop {
            let resp = client
                .list_objects_v2()
                .bucket(&bucket)
                .prefix(&prefix)
                .send()
                .await
                .map_err(|e| format!("列出对象失败: {}", e))?;

            let objects: Vec<_> = resp
                .contents()
                .iter()
                .filter_map(|o| o.key().map(|k| k.to_string()))
                .collect();

            if objects.is_empty() {
                break;
            }

            for key in &objects {
                let relative = key.strip_prefix("vfs/").unwrap_or(key);
                let trash_key = format!("trash/{}", relative);
                client
                    .copy_object()
                    .bucket(&bucket)
                    .copy_source(format!("/{}/{}", bucket, key))
                    .key(&trash_key)
                    .send()
                    .await
                    .map_err(|e| format!("复制到回收站失败: {}", e))?;
                client
                    .delete_object()
                    .bucket(&bucket)
                    .key(key)
                    .send()
                    .await
                    .map_err(|e| format!("删除原对象失败: {}", e))?;
            }
        }
    } else {
        let key = format!("vfs/{}", path.trim_start_matches('/'));
        let relative = path.trim_start_matches('/');
        let trash_key = format!("trash/{}", relative);
        client
            .copy_object()
            .bucket(&bucket)
            .copy_source(format!("/{}/{}", bucket, key))
            .key(&trash_key)
            .send()
            .await
            .map_err(|e| format!("复制到回收站失败: {}", e))?;
        client
            .delete_object()
            .bucket(&bucket)
            .key(&key)
            .send()
            .await
            .map_err(|e| format!("删除原文件失败: {}", e))?;
    }

    println!("[vfs] moved to trash: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn list_trash(
    state: State<'_, crate::AppState>,
) -> Result<Vec<TrashEntry>, String> {
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

    let resp = client
        .list_objects_v2()
        .bucket(&bucket)
        .prefix("trash/")
        .send()
        .await
        .map_err(|e| format!("列出回收站失败: {}", e))?;

    let mut entries: Vec<TrashEntry> = vec![];
    for obj in resp.contents() {
        let key = obj.key().unwrap_or("");
        if key == "trash/" {
            continue;
        }
        let orig_path = key.strip_prefix("trash/").unwrap_or(key);
        if orig_path.is_empty() {
            continue;
        }
        let is_dir = orig_path.ends_with('/');
        let name = orig_path
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or(orig_path)
            .to_string();
        let size = obj.size().unwrap_or(0);
        let deleted_at = obj
            .last_modified()
            .map(|dt| {
                let s = dt.to_string();
                if s.len() >= 19 { s[..19].to_string() } else { s }
            })
            .unwrap_or_default();

        entries.push(TrashEntry {
            name,
            original_path: orig_path.to_string(),
            is_directory: is_dir,
            size,
            deleted_at,
            trash_key: key.to_string(),
        });
    }

    // sort by deletion time descending (newest first)
    entries.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(entries)
}

#[tauri::command]
pub async fn restore_from_trash(
    state: State<'_, crate::AppState>,
    trash_key: String,
    is_directory: bool,
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

    if is_directory {
        let prefix = format!("{}/", trash_key.trim_end_matches('/'));
        loop {
            let resp = client
                .list_objects_v2()
                .bucket(&bucket)
                .prefix(&prefix)
                .send()
                .await
                .map_err(|e| format!("列出回收站对象失败: {}", e))?;

            let objects: Vec<_> = resp
                .contents()
                .iter()
                .filter_map(|o| o.key().map(|k| k.to_string()))
                .collect();

            if objects.is_empty() {
                break;
            }

            for key in &objects {
                let relative = key.strip_prefix("trash/").unwrap_or("");
                if relative.is_empty() {
                    continue;
                }
                let vfs_key = format!("vfs/{}", relative);
                client
                    .copy_object()
                    .bucket(&bucket)
                    .copy_source(format!("/{}/{}", bucket, key))
                    .key(&vfs_key)
                    .send()
                    .await
                    .map_err(|e| format!("恢复对象失败: {}", e))?;
                client
                    .delete_object()
                    .bucket(&bucket)
                    .key(key)
                    .send()
                    .await
                    .map_err(|e| format!("删除回收站对象失败: {}", e))?;
            }
        }
    } else {
        let relative = trash_key.strip_prefix("trash/").unwrap_or("");
        let vfs_key = format!("vfs/{}", relative);
        client
            .copy_object()
            .bucket(&bucket)
            .copy_source(format!("/{}/{}", bucket, trash_key))
            .key(&vfs_key)
            .send()
            .await
            .map_err(|e| format!("恢复文件失败: {}", e))?;
        client
            .delete_object()
            .bucket(&bucket)
            .key(&trash_key)
            .send()
            .await
            .map_err(|e| format!("删除回收站文件失败: {}", e))?;
    }

    println!("[vfs] restored from trash: {}", trash_key);
    Ok(())
}

#[tauri::command]
pub async fn delete_trash_permanently(
    state: State<'_, crate::AppState>,
    trash_key: String,
    is_directory: bool,
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

    if is_directory {
        let prefix = format!("{}/", trash_key.trim_end_matches('/'));
        loop {
            let resp = client
                .list_objects_v2()
                .bucket(&bucket)
                .prefix(&prefix)
                .send()
                .await
                .map_err(|e| format!("列出回收站对象失败: {}", e))?;

            let objects: Vec<_> = resp
                .contents()
                .iter()
                .filter_map(|o| o.key().map(|k| k.to_string()))
                .collect();

            if objects.is_empty() {
                break;
            }

            for key in &objects {
                client
                    .delete_object()
                    .bucket(&bucket)
                    .key(key)
                    .send()
                    .await
                    .map_err(|e| format!("永久删除失败: {}", e))?;
            }
        }
    } else {
        client
            .delete_object()
            .bucket(&bucket)
            .key(&trash_key)
            .send()
            .await
            .map_err(|e| format!("永久删除失败: {}", e))?;
    }

    println!("[vfs] permanently deleted: {}", trash_key);
    Ok(())
}

#[tauri::command]
pub async fn download_vfs_file(
    state: State<'_, crate::AppState>,
    vfs_path: String,
    local_path: String,
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
    let key = format!("vfs/{}", vfs_path.trim_start_matches('/'));

    let resp = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| format!("下载文件失败: {}", e))?;

    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|e| format!("读取文件内容失败: {}", e))?;

    tokio::fs::write(&local_path, bytes.to_vec())
        .await
        .map_err(|e| format!("保存文件失败: {}", e))?;

    println!("[vfs] downloaded: {} -> {}", key, local_path);
    Ok(())
}

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
