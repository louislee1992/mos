#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::Client;
use std::sync::Mutex;
use tauri::State;

mod accounts;
mod bootstrap;

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

    println!("[main.rs] verify_credentials: calling list_buckets");
    match client.list_buckets().send().await {
        Ok(resp) => {
            let bucket_count = resp.buckets().len();
            println!("[main.rs] verify_credentials: success, {} buckets", bucket_count);
            let mut minio = state.minio.lock().map_err(|e| e.to_string())?;
            *minio = Some(MinioConfig {
                endpoint,
                access_key,
                secret_key,
            });
            Ok(format!("ok, {} 个 bucket", bucket_count))
        }
        Err(e) => {
            let raw_msg = e.to_string();
            println!("[main.rs] verify_credentials: list_buckets failed: {}", raw_msg);
            let detail = if raw_msg.contains("dns error") || raw_msg.contains("Connect") {
                format!(
                    "无法连接到服务器\n地址: {}\n请检查 MinIO 是否启动、地址和端口是否正确",
                    endpoint
                )
            } else if raw_msg.contains("InvalidAccessKeyId")
                || raw_msg.contains("SignatureDoesNotMatch")
            {
                format!(
                    "凭证无效\n地址: {}\n请检查 Access Key 和 Secret Key",
                    endpoint
                )
            } else {
                format!("连接失败\n地址: {}\n详情: {}", endpoint, raw_msg)
            };
            Err(detail)
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            minio: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
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
            bootstrap::move_vfs_to_trash,
            bootstrap::list_trash,
            bootstrap::restore_from_trash,
            bootstrap::delete_trash_permanently,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
