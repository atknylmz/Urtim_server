// src/lib/axios.js
import axios from "axios";

/**
 * BASE URL seçimi (öncelik sırası):
 * 1) VITE_API_URL (örn: https://api.urtimakademi.com/api)
 * 2) (opsiyonel) VITE_API_BASE + '/api'
 * 3) PROD ortamında zorunlu varsayılan: https://api.urtimakademi.com/api
 * 4) DEV'de aynı origin + '/api'
 */
const clean = (s) => String(s || "").replace(/\/+$/, "");
const DEF_PROD_API = "https://api.urtimakademi.com/api";

const envApiUrl   = clean(import.meta.env?.VITE_API_URL);
const envApiBase  = clean(import.meta.env?.VITE_API_BASE);
const isProd      = !!import.meta.env?.PROD;

const API_URL =
  envApiUrl ||
  (envApiBase ? `${envApiBase}/api` :
   (isProd ? DEF_PROD_API : `${clean(location.origin)}/api`));

const TOKEN_KEYS = ["token", "authToken", "access_token"];

const getToken = () => {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  return null;
};

export const setAuthToken = (t, { persist = "local" } = {}) => {
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

// Tek yerden axios instance
export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

// İstek: auth header
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${t}`;
    }
  }
  return config;
});

// Yanıt: JSON bekleme garantisi (HTML geldiyse erken patlat)
function asClip(s, n = 200) { return (s ?? "").toString().slice(0, n); }
api.interceptors.response.use(
  (res) => {
    const ct = (res.headers?.["content-type"] || "").toLowerCase();
    if (!ct.includes("application/json")) {
      const snippet = typeof res.data === "string" ? asClip(res.data, 200) : "";
      const err = new Error(
        `JSON bekleniyordu ama geldi: ${ct || "bilinmiyor"} | örnek: ${snippet}`
      );
      err.status = res.status;
      err.data = res.data;
      return Promise.reject(err);
    }
    return res;
  },
  (err) => {
    // Axios hatasını normalize et
    if (err.response) {
      const data = err.response.data;
      const n = {
        status: err.response.status,
        data,
        message:
          data?.error || data?.message || `İstek ${err.response.status} ile başarısız`,
      };
      if (n.status === 401 || n.status === 403) {
        clearAuth();
        if (!location.pathname.includes("/login")) location.href = "/login";
      }
      return Promise.reject(n);
    }
    if (err.request) {
      return Promise.reject({ status: 0, message: "Sunucuya ulaşılamadı", data: null });
    }
    return Promise.reject({ status: 0, message: err.message || "Bilinmeyen hata", data: null });
  }
);

// ---- Yardımcılar (yol birleştirme güvenli) ----
const lead = (p) => (String(p || "").startsWith("/") ? p : `/${p}`);

export const getJson   = (url, config) => api.get(lead(url), config);
export const del       = (url, config) => api.delete(lead(url), config);
export const postJson  = (url, body, config) =>
  api.post(lead(url), body, { headers: { "Content-Type": "application/json" }, ...config });
export const putJson   = (url, body, config)  =>
  api.put(lead(url),  body, { headers: { "Content-Type": "application/json" }, ...config });
export const patchJson = (url, body, config)  =>
  api.patch(lead(url), body, { headers: { "Content-Type": "application/json" }, ...config });

export const uploadForm = (url, formData, { onProgress, ...config } = {}) =>
  api.post(lead(url), formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (evt) => {
          const total = evt.total ?? evt.target?.getResponseHeader?.("Content-Length");
          if (total) onProgress(Math.round((evt.loaded / total) * 100));
        }
      : undefined,
    ...config,
  });

// Debug için aç/kapat:
console.log("[axios] baseURL =", API_URL);

export default api;
