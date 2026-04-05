import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { onToastChange } from "./toast";

// Toast 渲染容器
const ToastRoot: React.FC = () => {
  const [toasts, setToasts] = useState<
    { id: number; msg: string; type: string }[]
  >([]);

  useEffect(() => {
    onToastChange((items) => setToasts([...items]));
  }, []);

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
