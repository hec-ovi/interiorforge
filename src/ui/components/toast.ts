import { el } from "./dom.js";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container || !document.body.contains(container)) {
    container = el("div", { class: "toast-container" });
    document.body.append(container);
  }
  return container;
}

export function showToast(options: ToastOptions): () => void {
  const { type = "info", title, message, duration = 3600 } = options;
  const cont = getContainer();

  const accent = el("div", { class: "toast-accent-bar" });
  const body = el("div", { class: "toast-body" });
  if (title) {
    body.append(el("div", { class: "toast-title" }, [title]));
  }
  body.append(el("div", { class: "toast-message" }, [message]));

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toastElem.classList.add("toast-dismissing");
    setTimeout(() => {
      toastElem.remove();
    }, 160);
  };

  const closeBtn = el("button", {
    class: "toast-close",
    "aria-label": "Close",
    onclick: (e) => {
      e.stopPropagation();
      dismiss();
    },
  }, ["✕"]);

  const toastElem = el("div", {
    class: `toast toast-${type}`,
    onclick: () => dismiss(),
  }, [accent, body, closeBtn]);

  cont.append(toastElem);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return dismiss;
}

export const toast = {
  show: showToast,
  info: (message: string, title?: string, duration?: number) =>
    showToast({ type: "info", message, title, duration }),
  success: (message: string, title?: string, duration?: number) =>
    showToast({ type: "success", message, title, duration }),
  warning: (message: string, title?: string, duration?: number) =>
    showToast({ type: "warning", message, title, duration }),
  error: (message: string, title?: string, duration?: number) =>
    showToast({ type: "error", message, title, duration }),
  clear: () => {
    if (container) {
      container.replaceChildren();
    }
  },
};
