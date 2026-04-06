import React, { useRef, useState, useEffect, useCallback } from "react";
import { Workbook } from "@fortune-sheet/react";
import type { WorkbookInstance } from "@fortune-sheet/react";
import type { Sheet } from "@fortune-sheet/core";
import "@fortune-sheet/react/dist/index.css";
import { parseClipboardEvent } from "./clipboard";
import { saveAsXlsx, saveAsCsv, getAppVersion } from "./tauri-api";
import { showToast } from "./toast";

// -------- 类型 & 工具函数 --------

/** 一个 tab = 一个独立文件 */
interface TabItem {
  id: string;
  title: string;
  sheets: Sheet[];
}

/** 全局自增计数器，确保 tab 标题不重复 */
let tabCounter = 1;

/** 创建一个新 tab（包含一个空白 sheet） */
function createTab(title?: string): TabItem {
  const num = tabCounter++;
  const id = `tab-${Date.now()}-${num}`;
  return {
    id,
    title: title ?? `文件${num}`,
    sheets: [
      {
        name: "Sheet1",
        id: `sheet-${id}`,
        celldata: [],
        row: 60,
        column: 26,
        status: 1,
      },
    ],
  };
}

/**
 * 将 sheet.data（二维数组）转换为 celldata（Fortune-Sheet 初始化需要的格式）。
 * getAllSheets() 返回的 celldata 不是实时的，必须从 data 手动转换。
 */
function dataToCelldata(data: Sheet["data"]): Sheet["celldata"] {
  const celldata: Sheet["celldata"] = [];
  if (!data) return celldata;
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v != null) {
        celldata.push({ r, c, v });
      }
    }
  }
  return celldata;
}

/**
 * 从 Fortune-Sheet 的 sheet.data（二维数组）中提取导出用的精简数据。
 * getAllSheets() 返回的 celldata 不是实时的，必须从 data 字段提取。
 */
function sheetsToExportData(sheets: Sheet[]) {
  return sheets.map((s) => {
    const cells: { r: number; c: number; v: string }[] = [];
    const data = s.data;
    if (data) {
      for (let r = 0; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (cell == null) continue;
          const val = typeof cell === "object" && cell !== null ? cell.v : cell;
          if (val != null && val !== "") {
            cells.push({ r, c, v: String(val) });
          }
        }
      }
    }
    return { name: s.name ?? "Sheet", cells };
  });
}

// -------- 主组件 --------
const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabItem[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [statusText, setStatusText] = useState(
    "就绪  |  从 Excel 复制单元格，按 Ctrl+V 粘贴到此处"
  );
  const [version, setVersion] = useState("0.1.0");

  const workbookRef = useRef<WorkbookInstance>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

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

  /** 将当前 Fortune-Sheet 的最新数据保存回当前 tab */
  const saveCurrentTabData = useCallback(() => {
    if (workbookRef.current) {
      try {
        const latestSheets = workbookRef.current.getAllSheets();
        // getAllSheets() 的 celldata 不是实时的，需要从 data 重新生成
        const synced = latestSheets.map((s) => ({
          ...s,
          celldata: dataToCelldata(s.data),
        }));
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId ? { ...t, sheets: synced } : t
          )
        );
      } catch {
        // ignore
      }
    }
  }, [activeTabId]);

  // ---- 切换 tab ----
  const switchTab = useCallback(
    (targetId: string) => {
      if (targetId === activeTabId) return;
      // 保存当前 tab 数据
      saveCurrentTabData();
      setActiveTabId(targetId);
    },
    [activeTabId, saveCurrentTabData]
  );

  // ---- 新建 tab ----
  const handleNew = useCallback(() => {
    // 保存当前 tab 数据
    saveCurrentTabData();
    const newTab = createTab();
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setStatusText("就绪  |  从 Excel 复制单元格，按 Ctrl+V 粘贴到此处");
    showToast(`已新建「${newTab.title}」`, "info");
  }, [saveCurrentTabData]);

  // ---- 关闭 tab ----
  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        if (prev.length <= 1) {
          showToast("至少保留一个标签页", "info");
          return prev;
        }
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        // 如果关闭的是当前 tab，切换到相邻 tab
        if (tabId === activeTabId) {
          const newIdx = Math.min(idx, next.length - 1);
          setActiveTabId(next[newIdx].id);
        }
        return next;
      });
    },
    [activeTabId]
  );

  // ---- 全局粘贴监听 ----
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (target.getAttribute("contenteditable") === "true") return;
    if (target.closest("[contenteditable='true']")) return;

    const parsed = parseClipboardEvent(e);
    if (!parsed) return;

    e.preventDefault();
    e.stopPropagation();

    const newCelldata = parsed.cells.map((cell) => ({
      r: cell.r,
      c: cell.c,
      v: { v: cell.v, m: cell.v, ct: { t: "g", fa: "General" } },
    }));
    const newRow = Math.max(60, parsed.rowCount + 20);
    const newCol = Math.max(26, parsed.colCount + 10);

    if (workbookRef.current) {
      try {
        const allSheets = workbookRef.current.getAllSheets();
        if (allSheets.length > 0) {
          const activeIdx = allSheets.findIndex((s) => s.status === 1);
          const idx = activeIdx >= 0 ? activeIdx : 0;
          const updated = allSheets.map((s, i) => {
            if (i !== idx) return s;
            return { ...s, celldata: newCelldata, row: newRow, column: newCol };
          });
          workbookRef.current.updateSheet(updated);
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
        // fallback
      }
    }

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

  // Fortune-Sheet onChange
  const handleChange = useCallback(
    (data: Sheet[]) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, sheets: data } : t))
      );
    },
    [activeTabId]
  );

  // ---- 读取当前 tab 最新数据 ----
  const getLatestSheets = useCallback((): Sheet[] => {
    if (workbookRef.current) {
      try {
        return workbookRef.current.getAllSheets();
      } catch {
        /* fallback */
      }
    }
    return activeTab.sheets;
  }, [activeTab.sheets]);

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

  return (
    <div className="app-container">
      {/* 工具栏 */}
      <div className="toolbar">
        <span className="toolbar-title">📋 Excel Copy</span>
        <div className="toolbar-sep" />

        <button
          className="btn btn-primary"
          onClick={handleNew}
          title="新建标签页"
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

      {/* Tab 栏 */}
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? "tab-active" : ""}`}
            onClick={() => switchTab(tab.id)}
            title={tab.title}
          >
            <span className="tab-title">{tab.title}</span>
            {tabs.length > 1 && (
              <span
                className="tab-close"
                onClick={(e) => handleCloseTab(tab.id, e)}
                title="关闭"
              >
                ×
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 表格主体 — key 强制重新挂载 */}
      <div className="sheet-container">
        <Workbook
          key={activeTabId}
          ref={workbookRef}
          data={activeTab.sheets}
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
