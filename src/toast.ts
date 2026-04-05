/**
 * Toast 通知管理
 */

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
  timer: ReturnType<typeof setTimeout>;
}

type Listener = (toasts: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 0;
let listener: Listener | null = null;

function notify() {
  listener?.(items);
}

export function onToastChange(cb: Listener) {
  listener = cb;
}

export function showToast(msg: string, type: ToastType = "info", duration = 2500) {
  const id = nextId++;
  const timer = setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    notify();
  }, duration);

  items = [...items, { id, msg, type, timer }];
  notify();
}
