use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::Client;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

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
pub struct CustomWallpaper {
    pub id: String,
    pub name: String,
    pub key: String,
}

fn default_wallpaper_type() -> String { "preset".into() }
fn default_solid_color() -> String { "#1a1a2e".into() }

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub version: u32,
    pub updated_at: i64,
    pub wallpaper_id: String,
    #[serde(default = "default_wallpaper_type")]
    pub wallpaper_type: String,
    #[serde(default = "default_solid_color")]
    pub solid_color: String,
    #[serde(default)]
    pub custom_wallpapers: Vec<CustomWallpaper>,
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
            wallpaper_type: "preset".into(),
            solid_color: "#1a1a2e".into(),
            custom_wallpapers: vec![],
            desktop_icon_order: vec!["file-manager".into(), "recycle-bin".into()],
            theme: "dark".into(),
            open_windows: vec![],
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub local_ip: String,
}

#[tauri::command]
pub async fn get_device_info() -> Result<DeviceInfo, String> {
    let info = os_info::get();
    let os_name = info.os_type().to_string();
    let os_version = info.version().to_string();
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".into());
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "unknown".into());
    Ok(DeviceInfo { os_name, os_version, hostname, local_ip })
}

pub fn derive_bucket_name(access_key: &str) -> String {
    format!("{}-os", access_key.to_lowercase().replace('_', "-"))
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

    // 先检查桶是否已存在，存在则跳过创建
    match client.head_bucket().bucket(&bucket).send().await {
        Ok(_) => println!("[bootstrap] bucket already exists: {}", bucket),
        Err(_) => {
            match client.create_bucket().bucket(&bucket).send().await {
                Ok(_) => println!("[bootstrap] bucket created: {}", bucket),
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("BucketAlreadyOwnedByYou") || msg.contains("BucketAlreadyExists") {
                        println!("[bootstrap] bucket exists (race): {}", bucket);
                    } else {
                        return Err(format!("创建桶失败: {}", msg));
                    }
                }
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

// ── Config Files ──────────────────────────────────

#[tauri::command]
pub async fn upload_config_file(
    state: State<'_, crate::AppState>,
    key: String,
    data: Vec<u8>,
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
    let config_key = format!("config/{}", key.trim_start_matches('/'));

    client
        .put_object()
        .bucket(&bucket)
        .key(&config_key)
        .body(data.into())
        .send()
        .await
        .map_err(|e| format!("上传配置文件失败: {}", e))?;
    println!("[config] uploaded: {}", config_key);
    Ok(())
}

#[tauri::command]
pub async fn delete_config_file(
    state: State<'_, crate::AppState>,
    key: String,
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
    let config_key = format!("config/{}", key.trim_start_matches('/'));

    client
        .delete_object()
        .bucket(&bucket)
        .key(&config_key)
        .send()
        .await
        .map_err(|e| format!("删除配置文件失败: {}", e))?;
    println!("[config] deleted: {}", config_key);
    Ok(())
}

#[tauri::command]
pub async fn read_config_file(
    state: State<'_, crate::AppState>,
    key: String,
) -> Result<Vec<u8>, String> {
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
    let config_key = format!("config/{}", key.trim_start_matches('/'));

    let resp = client
        .get_object()
        .bucket(&bucket)
        .key(&config_key)
        .send()
        .await
        .map_err(|e| format!("读取配置文件失败: {}", e))?;

    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|e| format!("读取配置内容失败: {}", e))?;

    Ok(bytes.to_vec())
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
pub async fn copy_vfs_object(
    state: State<'_, crate::AppState>,
    source_path: String,
    dest_path: String,
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
        let src_prefix = format!("vfs/{}/", source_path.trim_end_matches('/'));
        loop {
            let resp = client
                .list_objects_v2()
                .bucket(&bucket)
                .prefix(&src_prefix)
                .send()
                .await
                .map_err(|e| format!("列出对象失败: {}", e))?;

            let objects: Vec<_> = resp
                .contents()
                .iter()
                .filter_map(|o| o.key().map(|k| k.to_string()))
                .collect();

            if objects.is_empty() { break; }

            for key in &objects {
                let relative = key.strip_prefix("vfs/").unwrap_or("");
                let name_part = relative.strip_prefix(&format!("{}/", source_path.trim_end_matches('/'))).unwrap_or(relative);
                let dest_key = if key.ends_with('/') {
                    format!("vfs/{}/{}/", dest_path.trim_end_matches('/'), name_part.trim_end_matches('/'))
                } else {
                    format!("vfs/{}/{}", dest_path.trim_end_matches('/'), name_part)
                };
                if key.ends_with('/') {
                    client.put_object().bucket(&bucket).key(&dest_key).body(vec![].into()).send().await.map_err(|e| format!("创建目录失败: {}", e))?;
                } else {
                    client.copy_object().bucket(&bucket).copy_source(format!("/{}/{}", bucket, key)).key(&dest_key).send().await.map_err(|e| format!("复制对象失败: {}", e))?;
                }
            }
        }
    } else {
        let src_key = format!("vfs/{}", source_path.trim_start_matches('/'));
        let dest_key = format!("vfs/{}", dest_path.trim_start_matches('/'));
        client
            .copy_object()
            .bucket(&bucket)
            .copy_source(format!("/{}/{}", bucket, src_key))
            .key(&dest_key)
            .send()
            .await
            .map_err(|e| format!("复制文件失败: {}", e))?;
    }

    println!("[vfs] copied: {} -> {}", source_path, dest_path);
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

// ── File History ────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub name: String,
    pub path: String,
    pub file_type: String,
    pub size: i64,
    pub accessed_at: String,
}

#[tauri::command]
pub async fn record_file_history(
    state: State<'_, crate::AppState>,
    name: String,
    path: String,
    file_type: String,
    size: i64,
    accessed_at: String,
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
    let history_key = "config/history.json";

    let mut entries: Vec<HistoryEntry> = match client
        .get_object()
        .bucket(&bucket)
        .key(history_key)
        .send()
        .await
    {
        Ok(resp) => {
            let bytes = resp.body.collect().await.map_err(|e| format!("读取历史失败: {}", e))?;
            let json = String::from_utf8(bytes.to_vec()).map_err(|e| format!("历史编码错误: {}", e))?;
            serde_json::from_str(&json).unwrap_or_default()
        }
        Err(_) => vec![],
    };

    entries.retain(|e| e.path != path);
    entries.insert(0, HistoryEntry {
        name,
        path: path.clone(),
        file_type,
        size,
        accessed_at,
    });

    if entries.len() > 100 {
        entries.truncate(100);
    }

    let json = serde_json::to_string(&entries).map_err(|e| e.to_string())?;
    client
        .put_object()
        .bucket(&bucket)
        .key(history_key)
        .body(json.as_bytes().to_vec().into())
        .send()
        .await
        .map_err(|e| format!("保存历史失败: {}", e))?;

    println!("[history] recorded: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn list_file_history(
    state: State<'_, crate::AppState>,
) -> Result<Vec<HistoryEntry>, String> {
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
    let history_key = "config/history.json";

    match client
        .get_object()
        .bucket(&bucket)
        .key(history_key)
        .send()
        .await
    {
        Ok(resp) => {
            let bytes = resp.body.collect().await.map_err(|e| format!("读取历史失败: {}", e))?;
            let json = String::from_utf8(bytes.to_vec()).map_err(|e| format!("历史编码错误: {}", e))?;
            let entries: Vec<HistoryEntry> = serde_json::from_str(&json).unwrap_or_default();
            Ok(entries)
        }
        Err(_) => Ok(vec![]),
    }
}

// ── File Favorites ──────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteEntry {
    pub name: String,
    pub path: String,
    pub file_type: String,
    pub size: i64,
    pub added_at: String,
}

#[tauri::command]
pub async fn add_file_favorite(
    state: State<'_, crate::AppState>,
    name: String,
    path: String,
    file_type: String,
    size: i64,
    added_at: String,
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
    let fav_key = "config/favorites.json";

    let mut entries: Vec<FavoriteEntry> = match client
        .get_object().bucket(&bucket).key(fav_key).send().await
    {
        Ok(resp) => {
            let bytes = resp.body.collect().await.map_err(|e| format!("读取收藏失败: {}", e))?;
            let json = String::from_utf8(bytes.to_vec()).map_err(|e| format!("收藏编码错误: {}", e))?;
            serde_json::from_str(&json).unwrap_or_default()
        }
        Err(_) => vec![],
    };

    if entries.iter().any(|e| e.path == path) {
        return Ok(());
    }

    entries.insert(0, FavoriteEntry { name, path, file_type, size, added_at });
    let json = serde_json::to_string(&entries).map_err(|e| e.to_string())?;
    client.put_object().bucket(&bucket).key(fav_key).body(json.as_bytes().to_vec().into()).send().await.map_err(|e| format!("保存收藏失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn remove_file_favorite(
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
    let fav_key = "config/favorites.json";

    let mut entries: Vec<FavoriteEntry> = match client
        .get_object().bucket(&bucket).key(fav_key).send().await
    {
        Ok(resp) => {
            let bytes = resp.body.collect().await.map_err(|e| format!("读取收藏失败: {}", e))?;
            let json = String::from_utf8(bytes.to_vec()).map_err(|e| format!("收藏编码错误: {}", e))?;
            serde_json::from_str(&json).unwrap_or_default()
        }
        Err(_) => vec![],
    };

    entries.retain(|e| e.path != path);
    let json = serde_json::to_string(&entries).map_err(|e| e.to_string())?;
    client.put_object().bucket(&bucket).key(fav_key).body(json.as_bytes().to_vec().into()).send().await.map_err(|e| format!("保存收藏失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_file_favorites(
    state: State<'_, crate::AppState>,
) -> Result<Vec<FavoriteEntry>, String> {
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
    let fav_key = "config/favorites.json";

    match client.get_object().bucket(&bucket).key(fav_key).send().await {
        Ok(resp) => {
            let bytes = resp.body.collect().await.map_err(|e| format!("读取收藏失败: {}", e))?;
            let json = String::from_utf8(bytes.to_vec()).map_err(|e| format!("收藏编码错误: {}", e))?;
            Ok(serde_json::from_str(&json).unwrap_or_default())
        }
        Err(_) => Ok(vec![]),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub app_name: String,
    pub app_version: String,
    pub minio_endpoint: String,
    pub minio_bucket: String,
    pub object_count: u64,
    pub total_size_bytes: u64,
}

#[tauri::command]
pub async fn get_system_info(
    state: State<'_, crate::AppState>,
) -> Result<SystemInfo, String> {
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

    let mut object_count: u64 = 0;
    let mut total_size_bytes: u64 = 0;
    let mut continuation_token: Option<String> = None;

    loop {
        let mut req = client.list_objects_v2().bucket(&bucket).max_keys(1000);
        if let Some(token) = &continuation_token {
            req = req.continuation_token(token);
        }
        let resp = req.send().await.map_err(|e| format!("列出对象失败: {}", e))?;
        for obj in resp.contents() {
            object_count += 1;
            total_size_bytes += obj.size().unwrap_or(0) as u64;
        }
        if resp.is_truncated().unwrap_or(false) {
            continuation_token = resp.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(SystemInfo {
        app_name: "MOS".into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        minio_endpoint: endpoint,
        minio_bucket: bucket,
        object_count,
        total_size_bytes,
    })
}
