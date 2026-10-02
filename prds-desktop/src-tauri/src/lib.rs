fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    for &b in input.as_bytes() {
        if b == b'=' || b.is_ascii_whitespace() {
            continue;
        }
        let val = match TABLE.iter().position(|&x| x == b) {
            Some(idx) => idx as u32,
            None => return Err("Invalid base64 character".to_string()),
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Ok(out)
}

fn resolve_export_directory(custom_folder: Option<&str>) -> std::path::PathBuf {
    let user_profile = std::env::var("USERPROFILE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let downloads_dir = user_profile.join("Downloads");

    match custom_folder {
        Some(folder) if !folder.trim().is_empty() => {
            let p = std::path::Path::new(folder);
            if p.is_absolute() {
                p.to_path_buf()
            } else {
                let lower = folder.to_lowercase();
                if lower.starts_with("downloads\\") || lower.starts_with("downloads/") {
                    downloads_dir.join(&folder[10..])
                } else {
                    downloads_dir.join(folder)
                }
            }
        }
        _ => downloads_dir.join("PRDS_Exports"),
    }
}

fn get_unique_filepath(target_dir: &std::path::Path, filename: &str) -> (std::path::PathBuf, String) {
    let path = std::path::Path::new(filename);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(filename);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let base_root = match stem.rfind(" (") {
        Some(idx) if stem.ends_with(')') => {
            let num_part = &stem[idx + 2..stem.len() - 1];
            if num_part.chars().all(|c| c.is_ascii_digit()) {
                stem[..idx].trim()
            } else {
                stem
            }
        }
        _ => stem,
    };

    let ext_suffix = if ext.is_empty() {
        String::new()
    } else {
        format!(".{}", ext)
    };

    let initial_name = format!("{}{}", stem, ext_suffix);
    let initial_path = target_dir.join(&initial_name);
    if !initial_path.exists() {
        return (initial_path, initial_name);
    }

    let mut counter = 1;
    loop {
        let candidate_name = format!("{} ({}){}", base_root, counter, ext_suffix);
        let candidate_path = target_dir.join(&candidate_name);
        if !candidate_path.exists() {
            return (candidate_path, candidate_name);
        }
        counter += 1;
    }
}

#[tauri::command]
fn save_export_file(
    filename: String,
    base64_data: String,
    custom_folder: Option<String>,
) -> Result<String, String> {
    use std::io::Write;

    let target_dir = resolve_export_directory(custom_folder.as_deref());

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create export folder: {}", e))?;

    let (file_path, _actual_name) = get_unique_filepath(&target_dir, &filename);
    let bytes = decode_base64(&base64_data)?;

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create export file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write export file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

fn is_excel_or_spreadsheet_app_available(file_path: &str) -> bool {
    let ext = std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    #[cfg(target_os = "windows")]
    {
        // 1. Check if excel.exe is registered in Windows App Paths
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\excel.exe", "/ve"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if text.contains(".exe") {
                    return true;
                }
            }
        }

        // 2. Check association via assoc <ext>
        let ext_with_dot = if ext.starts_with('.') {
            ext.to_string()
        } else {
            format!(".{}", ext)
        };

        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", &format!("assoc {}", ext_with_dot)])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
                if text.contains("excel")
                    || text.contains("calc")
                    || text.contains("wps")
                    || text.contains("sheet")
                    || text.contains("planmaker")
                {
                    return true;
                }
            }
        }
    }

    false
}

#[tauri::command]
fn view_export_file(file_path: String, force_open_with: Option<bool>) -> Result<bool, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Export file not found: {}", file_path));
    }

    let force_dialog = force_open_with.unwrap_or(false);

    #[cfg(target_os = "windows")]
    {
        if !force_dialog && is_excel_or_spreadsheet_app_available(&file_path) {
            // Excel or compatible spreadsheet app detected: open directly
            let open_status = std::process::Command::new("cmd")
                .args(["/c", "start", "", &file_path])
                .status();

            match open_status {
                Ok(status) if status.success() => return Ok(true),
                _ => {
                    // Fall back to "Open with" dialog if direct start fails
                }
            }
        }

        // If no Excel/spreadsheet app detected or if forced or if open failed:
        // Launch Windows standard "How do you want to open this file?" dialog
        let spawn_result = std::process::Command::new("rundll32.exe")
            .args(["shell32.dll,OpenAs_RunDLL", &file_path])
            .spawn();

        return spawn_result
            .map(|_| true)
            .map_err(|e| format!("Failed to open Open With dialog: {}", e));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = std::process::Command::new("open")
            .arg(&file_path)
            .status()
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(status.success())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        },
    ));

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![save_export_file, view_export_file])
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PRDS desktop application");
}
