// server.js (API-only, Express 5, safe CORS)

import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Routers
import usersRouter from "./routes/users.js";
import videosRouter from "./routes/videos.js";
import examsRouter from "./routes/exams.js";
import videoExamsRouter from "./routes/videoExams.js";
import authRoutes from "./routes/auth.js";
import examResultsRouter from "./routes/examResults.js";
import guestApplicationsRouter from "./routes/guestApplications.js";

// Sequelize
import db from "./models/index.js";

const app = express();
app.set("trust proxy", 1);

/* ===================== CORS (whitelist) ===================== */
const defaultAllowed = [
  "https://urtimakademi.com",
  "https://www.urtimakademi.com",
  "https://urtimakademi.com.tr",
  "https://www.urtimakademi.com.tr",
  "http://urtimakademi.com",
  "http://www.urtimakademi.com",
  "http://urtimakademi.com.tr",
  "http://www.urtimakademi.com.tr",
  "http://akademi.urtimakademi.com",
  "https://akademi.urtimakademi.com",
  "http://localhost:5173",
  "http://localhost:5000",
  "https://urtim-server.onrender.com",
];

const envOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOW = new Set(envOrigins.length ? envOrigins : defaultAllowed);

function addCorsHeaders(req, res, next) {
  const origin = req.headers.origin;
  if (origin && ALLOW.has(origin)) {
    // credentials=true olduğunda '*' KULLANMAYIN
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,PATCH,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ||
        "Content-Type, Authorization, Range"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Range, Accept-Ranges"
    );
    res.setHeader("Access-Control-Max-Age", "600");
  }
  next();
}

function handlePreflight(req, res, next) {
  if (req.method !== "OPTIONS") return next();
  const origin = req.headers.origin;
  if (origin && ALLOW.has(origin)) {
    console.log("🔁 PREFLIGHT", origin, req.originalUrl);
    return res.sendStatus(204);
  }
  // Origin yoksa ya da whitelist dışındaysa sessiz 204 de verilebilir;
  // burada bilinçli olarak 403 dönüyoruz ki yanlış origin fark edilsin.
  return res.status(403).json({ error: "CORS: origin not allowed" });
}

app.use(addCorsHeaders);
app.use(handlePreflight);

/* ===================== Parsers & Logger ===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

/* ===================== Uploads (ephemeral) ===================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
    },
  })
);

/* ===================== Health ===================== */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/db/ping", async (_req, res) => {
  try {
    await db.sequelize.authenticate();
    res.json({ ok: true });
  } catch (e) {
    console.error("DB ping error:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/* ===================== Routers ===================== */
// Ana mount noktaları
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRouter);
app.use("/api/videos", videosRouter);
app.use("/api/exams", examsRouter);
app.use("/api/video-exams", videoExamsRouter);
app.use("/api/exam-results", examResultsRouter);
app.use("/api/guest-applications", guestApplicationsRouter);

// İsteğe bağlı alias'lar (relatif URL kaçakları için). İstersen kaldırabilirsin.
app.use("/auth", authRoutes);
app.use("/users", usersRouter);
app.use("/videos", videosRouter);
app.use("/exams", examsRouter);
app.use("/video-exams", videoExamsRouter);
app.use("/exam-results", examResultsRouter);
app.use("/guest-applications", guestApplicationsRouter);

/* ===================== 404 & Error JSON ===================== */
// /api altındaki bilinmeyen rotalar
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
// Diğer her şey
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Global error handler (JSON)
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  const status = err.status || 500;
  const msg =
    process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message || "Internal Server Error";
  res.status(status).json({ error: msg });
});

/* ===================== Listen ===================== */
const PORT = process.env.PORT || 5000;

try {
  app.listen(PORT, () => {
    console.log(`✅ Server ${PORT} portunda çalışıyor`);
    console.log("🌐 CORS allowList:", [...ALLOW].join(", "));
  });
} catch (error) {
  console.error("❌ Sunucu başlatılırken bir hata oluştu:", error);
  process.exit(1);
}
