// src/lib/axios.js
import axios from "axios";

/**
 * BASE URL seçimi:
 * 1) VITE_API_URL varsa onu kullan (örn: https://api.urtimakademi.com/api)
 * 2) Yoksa VITE_API_BASE + '/api' (örn: https://api.urtimakademi.com)
 * 3) Yoksa aynı origin + '/api' (dev için)
 */
const clean = (s) => String(s || "").replace(/\/+$/, "");
const API_URL =
  clean(import.meta.env.VITE_API_URL) ||
  (import.meta.env.VITE_API_BASE ? `${clean(import.meta.env.VITE_API_BASE)}/api` : `${clean(location.origin)}/api`);

// Token anahtar(lar)ı—uyumluluk için birkaç isim deniyoruz
const TOKEN_KEYS = ["token", "authToken", "access_token"];

const getToken = () => {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  return null;
};

export const setAuthToken = (t, { persist = "local" } = {}) => {
  // persist: 'local' | 'session'
  for (const k of TOKEN_KEYS) {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  }
  (persist === "session" ? sessionStorage : localStorage).setItem(TOKEN_KEYS[0], t);
};

export const clearAuth = () => {
  for (const k of TOKEN_KEYS) {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  }
};

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  withCredentials: true, // cookie tabanlı auth kullanmıyorsan şart değil ama dursun
  headers: {
    Accept: "application/json",
  },
});

// İstek interceptor: Token ekle
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) {
    config.headers = config.headers || {};
    // Eğer zaten header set ettiysen üzerine yazmaz
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${t}`;
    }
  }
  return config;
});

// Hata normalize edici
function normalizeError(err) {
  if (err.response) {
    return {
      status: err.response.status,
      data: err.response.data,
      message:
        err.response.data?.error ||
        err.response.data?.message ||
        `İstek ${err.response.status} ile başarısız`,
    };
  }
  if (err.request) {
    return { status: 0, message: "Sunucuya ulaşılamadı", data: null };
  }
  return { status: 0, message: err.message || "Bilinmeyen hata", data: null };
}

// Yanıt interceptor: 401/403 yakala
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const n = normalizeError(err);
    if (n.status === 401 || n.status === 403) {
      // İstersen bu bloğu kapatabilirsin
      clearAuth();
      // login rotan farklıysa değiştir
      if (!location.pathname.includes("/login")) {
        location.href = "/login";
      }
    }
    return Promise.reject(n);
  }
);

// --------- Sık kullanılan yardımcılar ---------

// JSON POST
export const postJson = (url, body, config) =>
  api.post(url, body, { headers: { "Content-Type": "application/json" }, ...config });

// Form-data upload (progress destekli)
export const uploadForm = (url, formData, { onProgress, ...config } = {}) =>
  api.post(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (evt) => {
        const total = evt.total ?? evt.target?.getResponseHeader?.("Content-Length");
        if (total) onProgress(Math.round((evt.loaded / total) * 100));
      }
      : undefined,
    ...config,
  });

// GET helper
export const getJson = (url, config) => api.get(url, config);

// DELETE helper
export const del = (url, config) => api.delete(url, config);

// PUT/PATCH helper
export const putJson = (url, body, config) =>
  api.put(url, body, { headers: { "Content-Type": "application/json" }, ...config });
export const patchJson = (url, body, config) =>
  api.patch(url, body, { headers: { "Content-Type": "application/json" }, ...config });

// Debug etmek istersen:
// console.log("[axios] baseURL =", API_URL);

export default api;
