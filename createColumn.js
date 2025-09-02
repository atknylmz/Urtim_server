require("dotenv").config();
const { pool } = require("../db"); // yol: scripts/../db

(async () => {
  try {
    await pool.query(`ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS url TEXT;`);
    console.log("✅ 'url' kolonu eklendi veya zaten mevcut.");
  } catch (err) {
    console.error("🚨 Kolon ekleme hatası:", err);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch {}
    console.log("🔌 Bağlantı kapatıldı.");
  }
})();
