/**
 * 剪贴板解析工具
 * 支持从 Excel 复制的 TSV 和 HTML 两种格式
 */

export interface ParsedCell {
  r: number;
  c: number;
  v: string;
}

export interface ParsedSheet {
  name: string;
  cells: ParsedCell[];
  rowCount: number;
  colCount: number;
}

/**
 * 解析 TSV 文本（Excel 默认粘贴格式：Tab 分隔）
 */
export function parseTsv(text: string): ParsedCell[] {
  const cells: ParsedCell[] = [];
  // 统一换行符
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // 去掉末尾空行
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  for (let r = 0; r < lines.length; r++) {
    const cols = splitTsvRow(lines[r]);
    for (let c = 0; c < cols.length; c++) {
      cells.push({ r, c, v: cols[c] });
    }
  }

  return cells;
}

/**
 * 正确拆分 TSV 行（处理含 tab 的引号包裹字段）
 */
function splitTsvRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // 转义引号 "" -> "
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "\t" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * 解析 HTML 表格（Excel 复制时附带的 HTML 格式，保留合并单元格等信息）
 */
export function parseHtmlTable(html: string): ParsedCell[] | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;

    const cells: ParsedCell[] = [];
    const rows = table.querySelectorAll("tr");

    for (let r = 0; r < rows.length; r++) {
      const tds = rows[r].querySelectorAll("td, th");
      let colOffset = 0;

      for (let i = 0; i < tds.length; i++) {
        const td = tds[i] as HTMLTableCellElement;
        // 优先用 innerText（保留换行），回退到 textContent
        const v = (td.innerText ?? td.textContent ?? "").trim();
        const colspan = td.colSpan || 1;

        cells.push({ r, c: colOffset, v });
        colOffset += colspan;
      }
    }

    return cells.length > 0 ? cells : null;
  } catch {
    return null;
  }
}

/**
 * 从 ClipboardEvent 解析数据
 * 策略：优先使用 HTML（保真度更高），降级为 TSV 纯文本
 */
export function parseClipboardEvent(e: ClipboardEvent): ParsedSheet | null {
  const htmlData = e.clipboardData?.getData("text/html") ?? "";
  const textData = e.clipboardData?.getData("text/plain") ?? "";

  if (!htmlData && !textData) return null;

  let cells: ParsedCell[] = [];

  if (htmlData) {
    const fromHtml = parseHtmlTable(htmlData);
    if (fromHtml && fromHtml.length > 0) {
      cells = fromHtml;
    } else {
      cells = parseTsv(textData);
    }
  } else {
    cells = parseTsv(textData);
  }

  if (cells.length === 0) return null;

  const rowCount = Math.max(...cells.map((c) => c.r)) + 1;
  const colCount = Math.max(...cells.map((c) => c.c)) + 1;

  return {
    name: "Sheet1",
    cells,
    rowCount,
    colCount,
  };
}
