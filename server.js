// server.js (API-only, Express 5 uyumlu — custom CORS)

import 'dotenv/config'; // dotenv'i ES Modül uyumlu hale getir
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url'; // ES Modüllerde __dirname yerine

// Routers
import usersRouter from './routes/users.js';
import videosRouter from './routes/videos.js';
import examsRouter from './routes/exams.js';
import videoExamsRouter from './routes/videoExams.js';
import authRoutes from './routes/auth.js';
import examResultsRouter from './routes/examResults.js';
import guestApplicationsRouter from './routes/guestApplications.js'; // Yeni rota

// Sequelize DB instance
import db from './models/index.js';

const app = express();
app.set("trust proxy", 1);

/* ===================== CORS (custom) ===================== */
const allowedOrigins = [
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
  "https://urtim-server.onrender.com", // test
];

const envList = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOW = new Set(envList.length ? envList : allowedOrigins);

// her istekte CORS header’larını yaz
function addCorsHeaders(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || ALLOW.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
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
    // stream ve range için gerekli response header’larını expose et
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Range, Accept-Ranges"
    );
  }
  next();
}

// OPTIONS preflight’ı kısa devre et (pattern kullanma!)
function handlePreflight(req, res, next) {
  if (req.method === "OPTIONS") {
    console.log("🔁 PREFLIGHT", req.headers.origin || "-", req.originalUrl);
    return res.sendStatus(204);
  }
  next();
}

app.use(addCorsHeaders);
app.use(handlePreflight);

/* ===================== Parsers & logger ===================== */
app.use(express.json({ limit: "10mb" }));
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

/* ===================== Uploads (ephemeral) ===================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads"); // __dirname kullanımı güncellendi
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
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
app.get("/api/db/ping", async (_req, res) => {
  try {
    await db.sequelize.authenticate(); // Sequelize bağlantısını kontrol et
    res.json({ ok: true });
  } catch (e) {
    console.error("DB ping error:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Tabloların oluşturulmasını/güncellenmesini tetikle
// ensureUserTables().catch((e) => console.error("ensureUserTables error:", e)); // Zaten users.js içinde çağrılıyor
// ensureExamTables().catch(e => console.error("ensureExamTables error:", e)); // Zaten exams.js içinde çağrılıyor
// ensureExamResultsTable().catch((e) => console.error("ensureExamResultsTable error:", e)); // Zaten examResults.js içinde çağrılıyor

/* ===================== Routers ===================== */
// asıl mount
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRouter);
app.use("/api/videos", videosRouter);
app.use("/api/exams", examsRouter);
app.use("/api/video-exams", videoExamsRouter);
app.use("/api/exam-results", examResultsRouter);
app.use("/api/guest-applications", guestApplicationsRouter); // Yeni rota eklendi

// geriye dönük alias (relative URL kaçakları için)
app.use("/auth", authRoutes);
app.use("/users", usersRouter);
app.use("/videos", videosRouter);
app.use("/exams", examsRouter);
app.use("/video-exams", videoExamsRouter);
app.use("/exam-results", examResultsRouter);
app.use("/guest-applications", guestApplicationsRouter); // Yeni rota alias eklendi

// 404’ler hep JSON (ROUTERLARDAN SONRA!)
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// global error -> JSON
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ===================== Listen ===================== */
const PORT = process.env.PORT || 5000;

// models/index.js'in veritabanı bağlantısını tamamlamasını beklemeye gerek yok,
// çünkü artık o dosya içindeki top-level await bunu hallediyor.
// Sunucuyu doğrudan başlatabiliriz.
try {
    app.listen(PORT, () => {
        console.log(`✅ Server ${PORT} portunda çalışıyor`);
        console.log("🌐 CORS allowList:", [...ALLOW].join(", "));
    });
} catch (error) {
    console.error('❌ Sunucu başlatılırken bir hata oluştu:', error);
    process.exit(1);
}
