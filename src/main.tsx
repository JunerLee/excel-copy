import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { onToastChange } from "./toast";

interface ToastItem {
  id: number;
  msg: string;
  type: string;
}

// ---- 全局错误捕获：确保任何 JS 错误都能可见 ----
window.addEventListener("error", (e) => {
  const msg = `[全局错误] ${e.message}\n文件: ${e.filename}:${e.lineno}\n${e.error?.stack ?? ""}`;
  console.error(msg);
  // 写入 DOM，确保即使 React 没挂载也能看到
  const errDiv = document.getElementById("startup-error");
  if (errDiv) {
    errDiv.style.display = "block";
    errDiv.textContent = msg;
  }
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = `[未处理的 Promise 错误] ${String(e.reason)}`;
  console.error(msg);
  const errDiv = document.getElementById("startup-error");
  if (errDiv) {
    errDiv.style.display = "block";
    errDiv.textContent = (errDiv.textContent ?? "") + "\n" + msg;
  }
});

// Toast 渲染容器（全局单例）
const ToastRoot: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = onToastChange((items) => {
      setToasts(items as ToastItem[]);
    });
    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
};

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("找不到 #root 元素，HTML 结构异常");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
    <ToastRoot />
  </React.StrictMode>
);
