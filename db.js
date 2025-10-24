// db.js (Render + lokal uyumlu)
import 'dotenv/config'; // Ortam değişkenlerini yükle
import { Pool } from "pg";

const isProd = process.env.NODE_ENV === "production";

// PGSSLMODE=require ise veya prod'daysan TLS aç
const ssl =
  process.env.PGSSLMODE === "require" ||
  process.env.PGSSLMODE === "prefer" ||
  isProd
    ? { rejectUnauthorized: false }
    : false;

const common = {
  max: parseInt(process.env.PGPOOL_MAX || "10", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  ssl,
};

// İstersen DATABASE_URL de kullanabil
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ...common })
  : new Pool({
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ...common,
    });

pool.on("error", (err) => {
  console.error("❗ PG pool error:", err);
});

async function ping() {
  const { rows } = await pool.query("select 1 as ok");
  return rows[0]?.ok === 1;
}

const query = (text, params) => pool.query(text, params);

export {
  pool, // Doğrudan pool objesini dışa aktar
  query,
  ping, // ping fonksiyonunu dışa aktar
};
