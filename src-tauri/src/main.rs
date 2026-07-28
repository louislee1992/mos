#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aws_credential_types::Credentials as AwsCredentials;
use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::Client;
use aws_smithy_runtime_api::client::identity::Identity;
use std::sync::Mutex;
use std::time::SystemTime;
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
async fn check_admin_access(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let (endpoint, access_key, secret_key) = {
        let minio = state.minio.lock().map_err(|e| e.to_string())?;
        let cfg = minio.as_ref().ok_or("未登录")?;
        (
            cfg.endpoint.clone(),
            cfg.access_key.clone(),
            cfg.secret_key.clone(),
        )
    };

    let url = format!("{}/minio/admin/v3/users", endpoint.trim_end_matches('/'));

    let (instructions, _sig) = {
        let creds = AwsCredentials::new(&access_key, &secret_key, None, None, "minio");
        let identity = Identity::new(creds, None);
        let mut builder = aws_sigv4::sign::v4::SigningParams::builder();
        builder.set_identity(Some(&identity));
        builder.set_region(Some("us-east-1"));
        builder.set_name(Some("s3"));
        builder.set_time(Some(SystemTime::now()));
        builder.set_settings(Some(aws_sigv4::http_request::SigningSettings::default()));
        let signing_params: aws_sigv4::http_request::SigningParams = builder
            .build()
            .map_err(|e| format!("构建签名参数失败: {}", e))?
            .into();

        let signable = aws_sigv4::http_request::SignableRequest::new(
            "GET",
            &url,
            std::iter::empty::<(&str, &str)>(),
            aws_sigv4::http_request::SignableBody::Bytes(&[]),
        )
        .map_err(|e| format!("构建签名请求失败: {}", e))?;

        aws_sigv4::http_request::sign(signable, &signing_params)
            .map_err(|e| format!("签名失败: {}", e))?
            .into_parts()
    };

    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    for (name, value) in instructions.headers() {
        req = req.header(name, value);
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            println!("[check_admin_access] status: {}", status);
            Ok(status.is_success())
        }
        Err(e) => {
            println!("[check_admin_access] request failed: {}", e);
            Ok(false)
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            minio: Mutex::new(None),
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
            bootstrap::move_vfs_to_trash,
            bootstrap::list_trash,
            bootstrap::restore_from_trash,
            bootstrap::delete_trash_permanently,
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
            check_admin_access,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
