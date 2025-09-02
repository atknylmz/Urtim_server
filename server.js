// server.js (Render için API-only)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Routers
const usersRouter = require("./routes/users");
const videosRouter = require("./routes/videos");
const examsRouter = require("./routes/exams");
const videoExamsRouter = require("./routes/videoExams");
const authRoutes = require("./routes/auth");
const examResultsRouter = require("./routes/examResults");

// DB ping
const { ping } = require("./db");

const app = express();
app.set("trust proxy", 1);

/* ========== CORS ========== */
const allowedOrigins = [
  "http://akademi.urtimakademi.com",
  "https://akademi.urtimakademi.com",
  "http://localhost:5173",
  "http://localhost:5000",
  "https://urtimakademi.com",
  "https://www.urtimakademi.com",
  "https://urtimakademi.com.tr",
  "https://www.urtimakademi.com.tr",
  "https://urtim-server.onrender.com", // test
];
const defaultAllowed = allowedOrigins;

const envList = (process.env.CLIENT_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const allowList = envList.length ? envList : defaultAllowed;

const corsOptions = {
  origin(origin, cb) {
    // origin'siz istekleri (healthcheck, curl) engelleme
    if (!origin) return cb(null, true);
    cb(null, allowList.includes(origin));
  },
  credentials: true,
  methods: ["GET","POST","PUT","DELETE","PATCH","OPTIONS"],
};

// CORS'u /api altında etkinleştir
app.use("/api", cors(corsOptions));

/* PATHSİZ preflight yakalayıcı (Express 5 uyumlu, pattern YOK) */
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    // cors() headerları zaten ekledi; garanti olsun diye headerları tekrar set edelim
    const origin = req.headers.origin;
    if (!origin || allowList.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin || "*");
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        req.header("Access-Control-Request-Headers") || "Content-Type, Authorization"
      );
      return res.sendStatus(204);
    }
    return res.status(403).send("CORS not allowed for this origin");
  }
  next();
});

/* ========== Body parser & logger ========== */
app.use(express.json({ limit: "10mb" }));
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

/* ========== Uploads (Render free kalıcı değil) ========== */
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
    },
  })
);

/* ========== Healthchecks ========== */
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
app.get("/api/db/ping", async (_req, res) => {
  try {
    const ok = await ping();
    res.json({ ok });
  } catch (e) {
    console.error("DB ping error:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/* ========== Routers (/api altında) ========== */
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRouter);
app.use("/api/videos", videosRouter);
app.use("/api/exams", examsRouter);
app.use("/api/video-exams", videoExamsRouter);
app.use("/api/exam-results", examResultsRouter);

/* 404 (sadece /api için) */
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

/* Genel hata yakalayıcı */
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ========== Listen ========== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} portunda çalışıyor`);
  console.log("🌐 CORS allowList:", allowList.join(", "));
});
