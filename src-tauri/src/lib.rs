mod commands;

use commands::{export_csv, export_xlsx, get_app_version};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            export_xlsx,
            export_csv,
            get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("excel-copy 启动失败");
}
