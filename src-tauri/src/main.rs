#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::Client;
use std::sync::Mutex;
use tauri::{AppHandle, State};

mod accounts;
mod bootstrap;
mod chat;

pub struct MinioConfig {
    pub endpoint: String,
    pub access_key: String,
    pub secret_key: String,
}

pub struct AppState {
    pub minio: Mutex<Option<MinioConfig>>,
}

fn normalize_endpoint(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/').to_string();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return String::new();
    }
    trimmed
}

#[tauri::command]
async fn verify_credentials(
    state: State<'_, AppState>,
    endpoint: String,
    access_key: String,
    secret_key: String,
) -> Result<String, String> {
    println!("[main.rs] verify_credentials called, endpoint: {}", endpoint.trim());
    let endpoint = normalize_endpoint(&endpoint);
    if endpoint.is_empty() {
        println!("[main.rs] verify_credentials: invalid endpoint");
        return Err("Endpoint 必须以 http:// 或 https:// 开头".into());
    }

    println!("[main.rs] verify_credentials: creating S3 client for {}", endpoint);
    let creds = Credentials::new(&access_key, &secret_key, None, None, "minio");

    let config = aws_sdk_s3::Config::builder()
        .credentials_provider(creds)
        .endpoint_url(&endpoint)
        .region(Region::new("us-east-1"))
        .force_path_style(true)
        .behavior_version(BehaviorVersion::latest())
        .build();

    let client = Client::from_conf(config);

    let bucket = bootstrap::derive_bucket_name(&access_key);
    println!("[main.rs] verify_credentials: checking bucket {}", bucket);
    match client.head_bucket().bucket(&bucket).send().await {
        Ok(_) => {
            println!("[main.rs] verify_credentials: bucket exists, credentials valid");
            let mut minio = state.minio.lock().map_err(|e| e.to_string())?;
            *minio = Some(MinioConfig {
                endpoint,
                access_key,
                secret_key,
            });
            Ok(format!("ok, bucket {} 可用", bucket))
        }
        Err(e) => {
            let debug_msg = format!("{:?}", e);
            println!("[main.rs] verify_credentials: head_bucket failed: {}", debug_msg);
            if debug_msg.contains("dns error") || debug_msg.contains("Connect") {
                Err(format!(
                    "无法连接到服务器\n地址: {}\n请检查 MinIO 是否启动、地址和端口是否正确",
                    endpoint
                ))
            } else if debug_msg.contains("InvalidAccessKeyId")
                || debug_msg.contains("SignatureDoesNotMatch")
            {
                Err(format!(
                    "凭证无效\n地址: {}\n请检查 Access Key 和 Secret Key",
                    endpoint
                ))
            } else if debug_msg.contains("404") || debug_msg.contains("NotFound") {
                // bucket 不存在但凭证有效，bootstrap 会创建它
                println!("[main.rs] verify_credentials: bucket not found, but credentials valid");
                let mut minio = state.minio.lock().map_err(|e| e.to_string())?;
                *minio = Some(MinioConfig {
                    endpoint,
                    access_key,
                    secret_key,
                });
                Ok(format!("凭证有效，将创建 bucket {}", bucket))
            } else {
                Err(format!("连接失败\n地址: {}\n详情: {}", endpoint, debug_msg))
            }
        }
    }
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn check_admin_access(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let access_key = {
        let minio = state.minio.lock().map_err(|e| e.to_string())?;
        let cfg = minio.as_ref().ok_or("未登录")?;
        cfg.access_key.clone()
    };

    let data = crate::accounts::load_accounts(app)?;
    let is_admin = data
        .accounts
        .iter()
        .any(|a| a.access_key == access_key && a.is_admin);
    println!("[check_admin_access] access_key={}, is_admin={}", access_key, is_admin);
    Ok(is_admin)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            minio: Mutex::new(None),
        })
        .manage(chat::ChatState {
            redis_conn: Mutex::new(None),
            redis_config: Mutex::new(None),
            pubsub_handle: Mutex::new(None),
            heartbeat_handle: Mutex::new(None),
            current_user: Mutex::new(String::new()),
            current_bucket: Mutex::new(String::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            verify_credentials,
            accounts::load_accounts,
            accounts::save_account,
            accounts::delete_account,
            bootstrap::bootstrap_user_bucket,
            bootstrap::save_user_settings,
            bootstrap::ensure_vfs,
            bootstrap::list_vfs,
            bootstrap::create_vfs_folder,
            bootstrap::create_vfs_file,
            bootstrap::upload_vfs_file,
            bootstrap::upload_vfs_folder,
            bootstrap::delete_vfs,
            bootstrap::download_vfs_file,
            bootstrap::read_vfs_text,
            bootstrap::write_vfs_text,
            bootstrap::copy_vfs_object,
            bootstrap::rename_vfs,
            bootstrap::move_vfs_to_trash,
            bootstrap::list_trash,
            bootstrap::restore_from_trash,
            bootstrap::delete_trash_permanently,
            bootstrap::record_login_history,
            bootstrap::list_login_history,
            bootstrap::record_file_history,
            bootstrap::list_file_history,
            bootstrap::add_file_favorite,
            bootstrap::remove_file_favorite,
            bootstrap::list_file_favorites,
            bootstrap::get_system_info,
            bootstrap::get_device_info,
            bootstrap::upload_config_file,
            bootstrap::delete_config_file,
            bootstrap::read_config_file,
            bootstrap::save_transfer_tasks,
            bootstrap::load_transfer_tasks,
            check_admin_access,
            chat::connect_redis,
            chat::disconnect_redis,
            chat::get_redis_status,
            chat::heartbeat,
            chat::get_user_profile,
            chat::update_user_profile,
            chat::get_online_users,
            chat::get_online_access_keys,
            chat::list_chat_profiles,
            chat::get_conversations,
            chat::get_or_create_private_conv,
            chat::load_conversation,
            chat::send_message,
            chat::create_group,
            chat::add_group_members,
            chat::capture_screenshot,
            chat::upload_chat_file,
            chat::send_cloud_file,
            chat::download_chat_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
