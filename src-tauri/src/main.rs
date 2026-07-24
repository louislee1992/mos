#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::Client;
use std::sync::Mutex;
use tauri::State;

#[allow(dead_code)]
struct MinioConfig {
    endpoint: String,
    access_key: String,
    secret_key: String,
}

struct AppState {
    minio: Mutex<Option<MinioConfig>>,
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
        .manage(AppState {
            minio: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![verify_credentials])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
