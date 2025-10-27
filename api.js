// src/lib/api.js
import axios from "axios";

/* ---- Token yardımcıları ---- */
export function getAuthUser() {
  try {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const part = t.split(".")[1] || "";
    // base64 padding düzelt (atob için)
    const padded = part + "===".slice((part.length + 3) % 4);
    const payload = JSON.parse(atob(padded));
    return payload || null; // { userId, authority, ... } / { id, ... }
  } catch {
    return null;
  }
}
export function getAuthUserId() {
  const p = getAuthUser();
  return p ? String(p.userId ?? p.id ?? p.sub ?? "") : "";
}

/* ---- BASE URL belirleme ---- */
const clean = (s) => String(s || "").replace(/\/+$/, "");
const DEF_PROD_API = "https://api.urtimakademi.com/api";
const envApiUrl  = clean(import.meta.env?.VITE_API_URL);
const envApiBase = clean(import.meta.env?.VITE_API_BASE);
const isProd     = !!import.meta.env?.PROD;

const BASE_URL =
  envApiUrl ||
  (envApiBase ? `${envApiBase}/api` :
   (isProd ? DEF_PROD_API : `${clean(location.origin)}/api`));

/* ---- Axios instance ---- */
const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { Accept: "application/json" },
});

// İstek: auth header ekle
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // (opsiyonel uyumluluk)
    if (!config.headers["x-access-token"]) {
      config.headers["x-access-token"] = token;
    }
  }
  return config;
});

// Yanıt: JSON bekleme garantisi (HTML geldiyse net hata)
api.interceptors.response.use(
  (res) => {
    const ct = (res.headers?.["content-type"] || "").toLowerCase();
    if (!ct.includes("application/json")) {
      const snippet = typeof res.data === "string" ? String(res.data).slice(0, 180) : "";
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
    if (err?.response?.status === 401) {
      console.warn("🔒 401 Unauthorized:", err?.response?.data || err.message);
    }
    return Promise.reject(err);
  }
);

// Debug: hangi baseURL kullanılıyor?
console.log("[api] baseURL =", BASE_URL);

export default api;
