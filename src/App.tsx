import React, { useRef, useState, useEffect, useCallback } from "react";
import { Workbook } from "@fortune-sheet/react";
import type { WorkbookInstance } from "@fortune-sheet/react";
import type { Sheet, CellWithRowAndCol } from "@fortune-sheet/core";
import "@fortune-sheet/react/dist/index.css";
import { parseClipboardEvent } from "./clipboard";
import { saveAsXlsx, saveAsCsv, getAppVersion } from "./tauri-api";
import { showToast } from "./toast";

// -------- 工具函数 --------

/** 创建空 Sheet */
function makeEmptySheet(name: string, id: string): Sheet {
  return {
    name,
    id,
    celldata: [],
    row: 60,
    column: 26,
    status: 1,
  };
}

/** ParsedCell[] → Fortune-Sheet CellWithRowAndCol[] */
function parsedToCelldata(
  cells: { r: number; c: number; v: string }[]
): CellWithRowAndCol[] {
  return cells.map((cell) => ({
    r: cell.r,
    c: cell.c,
    v: { v: cell.v, m: cell.v, ct: { t: "g", fa: "General" } },
  }));
}

/** Sheet[] → 导出用的精简数据 */
function sheetsToExportData(sheets: Sheet[]) {
  return sheets.map((s) => ({
    name: s.name ?? "Sheet",
    cells: (s.celldata ?? [])
      .filter((cell) => {
        const val = cell.v;
        return val != null && val.v != null && val.v !== "";
      })
      .map((cell) => ({
        r: cell.r,
        c: cell.c,
        v: String(cell.v!.v ?? ""),
      })),
  }));
}

/** 找到当前活动 sheet 的 index（status === 1 或 fallback 第 0 个） */
function findActiveIdx(sheets: Sheet[]): number {
  const idx = sheets.findIndex((s) => s.status === 1);
  return idx >= 0 ? idx : 0;
}

// -------- 主组件 --------
const App: React.FC = () => {
  const [sheets, setSheets] = useState<Sheet[]>(() => [
    makeEmptySheet("Sheet1", "sheet-1"),
  ]);
  const [hasData, setHasData] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [statusText, setStatusText] = useState(
    "就绪  |  从 Excel 复制单元格，按 Ctrl+V 粘贴到此处"
  );
  const [version, setVersion] = useState("0.1.0");

  const workbookRef = useRef<WorkbookInstance>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  // 保存最新的 sheets 引用（避免 handlePaste 捕获旧闭包）
  const sheetsRef = useRef<Sheet[]>(sheets);
  useEffect(() => { sheetsRef.current = sheets; }, [sheets]);

  // 获取应用版本号
  useEffect(() => {
    getAppVersion()
      .then((v) => setVersion(v))
      .catch(() => {});
  }, []);

  // 点击空白处关闭保存菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        saveMenuRef.current &&
        !saveMenuRef.current.contains(e.target as Node)
      ) {
        setShowSaveMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ---- 全局粘贴监听 ----
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 让 Fortune-Sheet 内部编辑状态自己处理粘贴
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (target.getAttribute("contenteditable") === "true") return;
    if (target.closest("[contenteditable='true']")) return;

    const parsed = parseClipboardEvent(e);
    if (!parsed) return;

    e.preventDefault();
    e.stopPropagation();

    const newCelldata = parsedToCelldata(parsed.cells);
    const newRow = Math.max(60, parsed.rowCount + 20);
    const newCol = Math.max(26, parsed.colCount + 10);

    // 优先通过 workbook ref API 更新（零闪烁、最可靠）
    if (workbookRef.current) {
      try {
        const allSheets = workbookRef.current.getAllSheets();
        if (allSheets.length > 0) {
          const activeIdx = findActiveIdx(allSheets);
          const updated = allSheets.map((s, idx) => {
            if (idx !== activeIdx) return s;
            return { ...s, celldata: newCelldata, row: newRow, column: newCol };
          });
          workbookRef.current.updateSheet(updated);
          setSheets(updated);
          setHasData(true);
          setStatusText(
            `已粘贴 ${parsed.rowCount} 行 × ${parsed.colCount} 列  |  共 ${parsed.cells.length} 个单元格`
          );
          showToast(
            `粘贴成功：${parsed.rowCount} 行 × ${parsed.colCount} 列`,
            "success"
          );
          return;
        }
      } catch {
        // 降级到 setState
      }
    }

    // Fallback：直接更新 React state
    setSheets((prev) => {
      const activeIdx = findActiveIdx(prev);
      return prev.map((s, idx) => {
        if (idx !== activeIdx) return s;
        return { ...s, celldata: newCelldata, row: newRow, column: newCol };
      });
    });
    setHasData(true);
    setStatusText(
      `已粘贴 ${parsed.rowCount} 行 × ${parsed.colCount} 列  |  共 ${parsed.cells.length} 个单元格`
    );
    showToast(
      `粘贴成功：${parsed.rowCount} 行 × ${parsed.colCount} 列`,
      "success"
    );
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste as EventListener, true);
    return () =>
      window.removeEventListener("paste", handlePaste as EventListener, true);
  }, [handlePaste]);

  // Fortune-Sheet onChange：同步最新数据到 state（确保导出时拿到用户编辑后的内容）
  const handleChange = useCallback((data: Sheet[]) => {
    setSheets(data);
    const total = data.reduce((sum, s) => sum + (s.celldata?.length ?? 0), 0);
    if (total > 0) setHasData(true);
  }, []);

  // ---- 读取最新数据（导出前调用）----
  const getLatestSheets = useCallback((): Sheet[] => {
    if (workbookRef.current) {
      try {
        return workbookRef.current.getAllSheets();
      } catch {
        /* fallback */
      }
    }
    return sheetsRef.current;
  }, []);

  // ---- 保存为 xlsx ----
  const handleSaveXlsx = useCallback(async () => {
    setShowSaveMenu(false);
    const exportData = sheetsToExportData(getLatestSheets());

    if (exportData.every((s) => s.cells.length === 0)) {
      showToast("表格没有数据，请先粘贴内容", "error");
      return;
    }

    setStatusText("正在保存...");
    try {
      const filePath = await saveAsXlsx(exportData);
      if (filePath) {
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        showToast(`已保存：${fileName}`, "success");
        setStatusText(`已保存：${fileName}`);
      } else {
        setStatusText("操作已取消");
      }
    } catch (err) {
      showToast(`保存失败：${String(err)}`, "error");
      setStatusText("保存失败");
    }
  }, [getLatestSheets]);

  // ---- 保存为 csv ----
  const handleSaveCsv = useCallback(async () => {
    setShowSaveMenu(false);
    const exportData = sheetsToExportData(getLatestSheets());

    if (exportData.every((s) => s.cells.length === 0)) {
      showToast("表格没有数据，请先粘贴内容", "error");
      return;
    }

    setStatusText("正在保存...");
    try {
      const filePath = await saveAsCsv(exportData);
      if (filePath) {
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        showToast(`已保存：${fileName}`, "success");
        setStatusText(`已保存：${fileName}`);
      } else {
        setStatusText("操作已取消");
      }
    } catch (err) {
      showToast(`保存失败：${String(err)}`, "error");
      setStatusText("保存失败");
    }
  }, [getLatestSheets]);

  // ---- 新建空白表格 ----
  const handleNew = useCallback(() => {
    const fresh = [makeEmptySheet("Sheet1", `sheet-${Date.now()}`)];
    setSheets(fresh);
    setHasData(false);
    setStatusText("就绪  |  从 Excel 复制单元格，按 Ctrl+V 粘贴到此处");
    showToast("已新建空白表格", "info");
  }, []);

  return (
    <div className="app-container">
      {/* 工具栏 */}
      <div className="toolbar">
        <span className="toolbar-title">📋 Excel Copy</span>
        <div className="toolbar-sep" />

        <button
          className="btn btn-primary"
          onClick={handleNew}
          title="新建空白表格"
        >
          📄 新建
        </button>

        <div className="toolbar-sep" />

        {/* 保存下拉 */}
        <div className="save-dropdown" ref={saveMenuRef}>
          <button
            className="btn btn-success"
            onClick={() => setShowSaveMenu((v) => !v)}
            title="保存文件"
          >
            💾 保存 ▾
          </button>
          {showSaveMenu && (
            <div className="save-menu">
              <div className="save-menu-item" onClick={handleSaveXlsx}>
                <span className="ext">xlsx</span>
                Excel 工作簿
              </div>
              <div className="save-menu-item" onClick={handleSaveCsv}>
                <span className="ext">csv</span>
                CSV 文本文件
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 表格主体 */}
      <div className="sheet-container">
        {/* 空状态引导提示 */}
        {!hasData && (
          <div className="paste-hint">
            <div className="paste-hint-icon">📋</div>
            <div className="paste-hint-text">
              在 Excel 中选中单元格并复制，然后在此处按
              <br />
              <span className="paste-hint-shortcut">Ctrl + V</span> 即可粘贴
            </div>
          </div>
        )}

        <Workbook
          ref={workbookRef}
          data={sheets}
          onChange={handleChange}
          showToolbar={true}
          showFormulaBar={true}
          showSheetTabs={true}
          lang="zh"
        />
      </div>

      {/* 状态栏 */}
      <div className="statusbar">
        <span>{statusText}</span>
        <span style={{ marginLeft: "auto", opacity: 0.6, fontSize: "11px" }}>
          Excel Copy v{version}
        </span>
      </div>
    </div>
  );
};

export default App;
