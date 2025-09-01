// server.js (Render için API-only)

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

const app = express();
app.set("trust proxy", 1);

// ===== CORS (routes'tan ÖNCE) =====
const defaultAllowed = [
  "http://localhost:5173",
  "http://localhost:5000",
  "https://urtimakademi.com",
  "https://www.urtimakademi.com",
  "https://urtimakademi.com.tr",
  "https://www.urtimakademi.com.tr",
  "https://api.urtimakademi.com",
];

const allowList =
  (process.env.CLIENT_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length > 0
    ? (process.env.CLIENT_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : defaultAllowed;

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // Postman vb.
    cb(null, allowList.includes(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // preflight aynı seçeneklerle

// ===== Body parser & basit logger =====
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

// ===== Uploads (kalıcı disk) =====
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".mp4")) {
        res.setHeader("Content-Type", "video/mp4");
      }
    },
  })
);

// ===== Healthcheck =====
app.get("/api/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// ===== Routers (/api altında) =====
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRouter);
app.use("/api/videos", videosRouter);
app.use("/api/exams", examsRouter);
app.use("/api/video-exams", videoExamsRouter);
app.use("/api/exam-results", examResultsRouter);

// 404 (sadece /api için)
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Genel hata yakalayıcı (opsiyonel)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// --- SPA fallback KAPALI ---
// cPanel’de frontend’i servis edeceğin için burada SPA fallback yok.
// İstersen sadece local geliştirmede açmak için:
// if (process.env.SERVE_CLIENT === "true") { ... }

// ===== Listen (TEK KEZ) =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} portunda çalışıyor`);
  console.log("🌐 CORS allowList:", allowList.join(", "));
});
