use serde::{Deserialize, Serialize};
use rust_xlsxwriter::Workbook;
use std::collections::HashMap;

/// 单元格数据结构（与前端 Fortune-Sheet 对齐）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CellData {
    /// 行索引（0-based）
    pub r: u32,
    /// 列索引（0-based）
    pub c: u32,
    /// 单元格值（字符串）
    pub v: Option<String>,
}

/// Sheet 数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SheetData {
    pub name: String,
    pub cells: Vec<CellData>,
}

/// 错误类型
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("xlsx 写入错误: {0}")]
    XlsxError(#[from] rust_xlsxwriter::XlsxError),
    #[error("csv 写入错误: {0}")]
    CsvError(#[from] csv::Error),
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
    #[error("数据为空: {0}")]
    EmptyData(String),
}

// Tauri 要求 AppError 实现 Serialize
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

/// 导出为 xlsx
#[tauri::command]
pub fn export_xlsx(sheets: Vec<SheetData>, file_path: String) -> Result<(), AppError> {
    let mut workbook = Workbook::new();

    for sheet in &sheets {
        let worksheet = workbook.add_worksheet();
        worksheet.set_name(&sheet.name)?;

        // 按行列组织数据
        let mut grid: HashMap<(u32, u32), String> = HashMap::new();
        let mut max_row = 0u32;
        let mut max_col = 0u32;

        for cell in &sheet.cells {
            if let Some(ref v) = cell.v {
                if !v.is_empty() {
                    grid.insert((cell.r, cell.c), v.clone());
                    if cell.r > max_row {
                        max_row = cell.r;
                    }
                    if cell.c > max_col {
                        max_col = cell.c;
                    }
                }
            }
        }

        // 写入数据
        for row in 0..=max_row {
            for col in 0..=max_col {
                if let Some(val) = grid.get(&(row, col)) {
                    // 尝试写为数字，否则写字符串
                    if let Ok(num) = val.parse::<f64>() {
                        worksheet.write_number(row, col as u16, num)?;
                    } else {
                        worksheet.write_string(row, col as u16, val)?;
                    }
                }
            }
        }

        // 自动调整列宽
        worksheet.autofit();
    }

    workbook.save(&file_path)?;
    Ok(())
}

/// 导出为 csv（只导出第一个 sheet）
#[tauri::command]
pub fn export_csv(sheets: Vec<SheetData>, file_path: String) -> Result<(), AppError> {
    let sheet = sheets
        .into_iter()
        .next()
        .ok_or_else(|| AppError::EmptyData("无数据".to_string()))?;

    let mut grid: HashMap<(u32, u32), String> = HashMap::new();
    let mut max_row = 0u32;
    let mut max_col = 0u32;

    for cell in &sheet.cells {
        if let Some(ref v) = cell.v {
            if !v.is_empty() {
                grid.insert((cell.r, cell.c), v.clone());
                if cell.r > max_row {
                    max_row = cell.r;
                }
                if cell.c > max_col {
                    max_col = cell.c;
                }
            }
        }
    }

    let file = std::fs::File::create(&file_path)?;
    let mut wtr = csv::Writer::from_writer(file);

    for row in 0..=max_row {
        let record: Vec<String> = (0..=max_col)
            .map(|col| grid.get(&(row, col)).cloned().unwrap_or_default())
            .collect();
        wtr.write_record(&record)?;
    }

    wtr.flush()?;
    Ok(())
}

/// 获取应用版本号
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
