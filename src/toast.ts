/**
 * Toast 通知管理（模块级单例，线程安全）
 */

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

type Listener = (toasts: ReadonlyArray<ToastItem>) => void;

let items: ToastItem[] = [];
let nextId = 0;
// 使用 Set 支持多个监听器（React 严格模式会双重挂载）
const listeners = new Set<Listener>();

function notify() {
  const snapshot = [...items];
  listeners.forEach((cb) => cb(snapshot));
}

/** 注册监听器，返回取消注册函数 */
export function onToastChange(cb: Listener): () => void {
  listeners.add(cb);
  // 立即通知当前状态
  cb([...items]);
  return () => {
    listeners.delete(cb);
  };
}

/** 显示一条 toast 通知 */
export function showToast(
  msg: string,
  type: ToastType = "info",
  duration = 2500
): void {
  const id = nextId++;

  items = [...items, { id, msg, type }];
  notify();

  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    notify();
  }, duration);
}
