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

/// 将 SheetData 的 cells 整理为 grid + 行列边界
/// 返回 (grid, max_row, max_col)；若无数据则 grid 为空，max_row/max_col 为 0
fn cells_to_grid(cells: &[CellData]) -> (HashMap<(u32, u32), String>, Option<u32>, Option<u32>) {
    let mut grid: HashMap<(u32, u32), String> = HashMap::new();
    let mut max_row: Option<u32> = None;
    let mut max_col: Option<u32> = None;

    for cell in cells {
        if let Some(ref v) = cell.v {
            if !v.is_empty() {
                grid.insert((cell.r, cell.c), v.clone());
                max_row = Some(max_row.map_or(cell.r, |m: u32| m.max(cell.r)));
                max_col = Some(max_col.map_or(cell.c, |m: u32| m.max(cell.c)));
            }
        }
    }

    (grid, max_row, max_col)
}

/// 导出为 xlsx（支持多 Sheet）
#[tauri::command]
pub fn export_xlsx(sheets: Vec<SheetData>, file_path: String) -> Result<(), AppError> {
    let mut workbook = Workbook::new();

    for sheet in &sheets {
        let worksheet = workbook.add_worksheet();
        // sheet 名称长度限制为 31 字符（xlsx 规范）
        let safe_name: String = sheet.name.chars().take(31).collect();
        worksheet.set_name(&safe_name)?;

        let (grid, max_row_opt, max_col_opt) = cells_to_grid(&sheet.cells);

        // 若该 sheet 完全为空，跳过写入
        let (max_row, max_col) = match (max_row_opt, max_col_opt) {
            (Some(r), Some(c)) => (r, c),
            _ => continue,
        };

        for row in 0..=max_row {
            for col in 0..=max_col {
                if let Some(val) = grid.get(&(row, col)) {
                    // 优先尝试写为数字，否则写字符串
                    if let Ok(num) = val.parse::<f64>() {
                        worksheet.write_number(row, col as u16, num)?;
                    } else {
                        worksheet.write_string(row, col as u16, val)?;
                    }
                }
            }
        }

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
        .ok_or_else(|| AppError::EmptyData("无 sheet 数据".to_string()))?;

    let (grid, max_row_opt, max_col_opt) = cells_to_grid(&sheet.cells);

    // 若无数据，写空文件即可（不报错）
    let file = std::fs::File::create(&file_path)?;
    let mut wtr = csv::Writer::from_writer(file);

    if let (Some(max_row), Some(max_col)) = (max_row_opt, max_col_opt) {
        for row in 0..=max_row {
            let record: Vec<String> = (0..=max_col)
                .map(|col| grid.get(&(row, col)).cloned().unwrap_or_default())
                .collect();
            wtr.write_record(&record)?;
        }
    }

    wtr.flush()?;
    Ok(())
}

/// 获取应用版本号
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
