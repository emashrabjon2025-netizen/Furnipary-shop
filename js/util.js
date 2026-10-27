import { CATEGORIES } from "./config.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function formatPrice(n) {
  const v = Math.round(Number(n) || 0);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || "Boshqa";
}

// Excel'dagi yozuvdan (masalan "Garderob mexanizm", "матрас") kategoriya id'sini topadi
export function matchCategory(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return "";
  const exact = CATEGORIES.find((c) => c.id === t || c.label.toLowerCase() === t);
  if (exact) return exact.id;
  return CATEGORIES.find((c) => c.keys.some((k) => t.includes(k)))?.id || "";
}

// "365 000", "365.000 so'm", "365000" -> 365000
export function parsePrice(v) {
  if (typeof v === "number") return Math.round(v);
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function effectivePrice(p) {
  return p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price;
}

export function toast(msg, type = "ok") {
  let box = $("#toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add("hide"), 2600);
  setTimeout(() => el.remove(), 3000);
}

// Rasmni brauzerning o'zida kichraytiradi va JPEG data-URL qaytaradi
export function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasmni o'qib bo'lmadi"));
    };
    img.src = url;
  });
}

export function normalizePhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 9) return "+998" + d;
  if (d.length === 12 && d.startsWith("998")) return "+" + d;
  return null;
}

export const PLACEHOLDER_IMG = "img/placeholder.svg";
