// createColumn.js
const { Pool } = require("pg");

const pool = new Pool({
  host: "192.168.0.220",
  port: 5433,
  user: "postgres",
  password: "123",
  database: "postgres",
});

(async () => {
  try {
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS url TEXT;`);
    console.log("✅ 'url' kolonu eklendi veya zaten mevcut.");
    await pool.end();
  } catch (err) {
    console.error("🚨 Kolon ekleme hatası:", err);
    process.exit(1);
  }
})();
