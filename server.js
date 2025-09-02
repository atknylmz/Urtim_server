// server.js (API-only, Express 5 uyumlu — custom CORS)

require("dotenv").config();
const express = require("express");
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

/* ===================== CORS (custom) ===================== */
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
// .env ile override: CLIENT_ORIGINS="https://a.com,https://b.com"
const envList = (process.env.CLIENT_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const ALLOW = new Set(envList.length ? envList : allowedOrigins);

// her istekte CORS header’larını yaz
function addCorsHeaders(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || ALLOW.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] || "Content-Type, Authorization"
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

/* ===================== Health ===================== */
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

/* ===================== Routers ===================== */
// asıl mount
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRouter);
app.use("/api/videos", videosRouter);
app.use("/api/exams", examsRouter);
app.use("/api/video-exams", videoExamsRouter);
app.use("/api/exam-results", examResultsRouter);

// geriye dönük alias (relative URL kaçakları için)
app.use("/auth", authRoutes);
app.use("/users", usersRouter);
app.use("/videos", videosRouter);
app.use("/exams", examsRouter);
app.use("/video-exams", videoExamsRouter);
app.use("/exam-results", examResultsRouter);

// 404’ler hep JSON
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// global error -> JSON
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ===================== Listen ===================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} portunda çalışıyor`);
  console.log("🌐 CORS allowList:", [...ALLOW].join(", "));
});
