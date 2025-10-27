// src/lib/api.js
import axios from "axios";

export function getAuthUser() {
  try {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const payload = JSON.parse(atob(t.split(".")[1] || ""));
    return payload || null; // ör: { userId, authority, ... } veya { id, ... }
  } catch {
    return null;
  }
}

// ✅ URL'de kullanacağımız id'yi güvenle çıkar
export function getAuthUserId() {
  const p = getAuthUser();
  return p ? String(p.userId ?? p.id ?? p.sub ?? "") : "";
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    // (opsiyonel) bazı backend’ler için:
    config.headers["x-access-token"] = token;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      console.warn("🔒 401 Unauthorized:", err?.response?.data || err.message);
    }
    return Promise.reject(err);
  }
);

export default api;
