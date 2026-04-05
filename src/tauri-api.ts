/**
 * Tauri 命令调用封装
 */
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export interface ExportCell {
  r: number;
  c: number;
  v: string | null;
}

export interface ExportSheet {
  name: string;
  cells: ExportCell[];
}

/**
 * 弹出保存对话框并写入 xlsx 文件
 */
export async function saveAsXlsx(sheets: ExportSheet[]): Promise<string | null> {
  const filePath = await save({
    title: "保存为 Excel 文件",
    defaultPath: "表格数据.xlsx",
    filters: [
      { name: "Excel 文件", extensions: ["xlsx"] },
    ],
  });

  if (!filePath) return null;

  await invoke<void>("export_xlsx", { sheets, filePath });
  return filePath;
}

/**
 * 弹出保存对话框并写入 csv 文件
 */
export async function saveAsCsv(sheets: ExportSheet[]): Promise<string | null> {
  const filePath = await save({
    title: "保存为 CSV 文件",
    defaultPath: "表格数据.csv",
    filters: [
      { name: "CSV 文件", extensions: ["csv"] },
    ],
  });

  if (!filePath) return null;

  await invoke<void>("export_csv", { sheets, filePath });
  return filePath;
}

/**
 * 获取应用版本号
 */
export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}
