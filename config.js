// config.js
require("dotenv").config();
function must(name){ const v=process.env[name]; if(!v) throw new Error(`Missing env: ${name}`); return v; }

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 5000,

  JWT_SECRET: must("JWT_SECRET"),
  JWT_EXPIRES: process.env.JWT_EXPIRES || "1d",

  PGHOST: must("PGHOST"),
  PGPORT: process.env.PGPORT || 5432,
  PGUSER: must("PGUSER"),
  PGPASSWORD: must("PGPASSWORD"),
  PGDATABASE: must("PGDATABASE"),
};
