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

// Toast 渲染容器（全局单例）
const ToastRoot: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    // onToastChange 返回取消注册函数，useEffect 清理时调用
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <ToastRoot />
  </React.StrictMode>
);
