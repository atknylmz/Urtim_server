// config.js
require("dotenv").config();

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const hasDbUrl = !!process.env.DATABASE_URL;

// DATABASE_URL varsa PGHOST/PGUSER gibi alanları zorunlu tutma
if (!hasDbUrl) {
  must("PGHOST");
  must("PGUSER");
  must("PGPASSWORD");
  must("PGDATABASE");
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 5000),

  // Auth
  JWT_SECRET: must("JWT_SECRET"),
  JWT_EXPIRES: process.env.JWT_EXPIRES || "1d",

  // DB
  DATABASE_URL: process.env.DATABASE_URL || null,
  PGHOST: process.env.PGHOST,
  PGPORT: Number(process.env.PGPORT || 5432),
  PGUSER: process.env.PGUSER,
  PGPASSWORD: process.env.PGPASSWORD,
  PGDATABASE: process.env.PGDATABASE,
  PGSSLMODE: process.env.PGSSLMODE, // require | prefer | disable

  // CORS / URL
  CLIENT_ORIGINS: (process.env.CLIENT_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null,

  // (opsiyonel) upload klasörü kullanırsan
  UPLOAD_DIR: process.env.UPLOAD_DIR || null,
};
