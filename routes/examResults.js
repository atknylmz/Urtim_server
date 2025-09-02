// routes/examResults.js — tek PG pool + şema garantisi
const express = require("express");
const { pool } = require("../db");

const router = express.Router();

/* ---------------------- ŞEMA GARANTİSİ ---------------------- */
async function ensureExamResultsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.exam_results (
      id          SERIAL PRIMARY KEY,
      "user"      TEXT        NOT NULL,
      video_id    INTEGER     REFERENCES public.videos(id) ON DELETE CASCADE,
      exam_title  TEXT,
      score       NUMERIC,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS exam_results_user_lower_idx ON public.exam_results (lower("user"));`);
  await pool.query(`CREATE INDEX IF NOT EXISTS exam_results_video_id_idx    ON public.exam_results (video_id);`);
  console.log("✅ exam_results tablosu hazır");
}
ensureExamResultsTable().catch((e) => console.error("ensureExamResultsTable error:", e));

/* ---------------- Sınav sonucu kaydet ---------------- */
router.post("/", async (req, res) => {
  let { videoId, score, examTitle, userName } = req.body || {};

  const vId = Number.parseInt(videoId, 10);
  const sVal = Number(score);
  if (!Number.isFinite(vId) || !Number.isFinite(sVal) || !examTitle || !String(userName || "").trim()) {
    return res.status(400).json({ error: "Eksik veya geçersiz veri" });
  }
  userName = String(userName).trim();
  examTitle = String(examTitle).trim();

  try {
    const result = await pool.query(
      `INSERT INTO public.exam_results ("user", video_id, exam_title, score)
       VALUES ($1, $2, $3, $4)
       RETURNING id, "user", video_id, exam_title, score::float, created_at`,
      [userName, vId, examTitle, sVal]
    );

    return res.status(201).json({
      message: "✅ Sınav sonucu başarıyla kaydedildi",
      result: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Sınav sonucu kayıt hatası:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

/* ---------------- Kullanıcıya göre en yüksek skorlar ---------------- */
router.get("/user/:userName", async (req, res) => {
  const userName = decodeURIComponent(req.params.userName || "").trim();
  if (!userName) return res.status(400).json({ error: "userName gerekli" });

  try {
    const q = `
      SELECT video_id, MAX(score)::float AS score
        FROM public.exam_results
       WHERE lower("user") = lower($1)
       GROUP BY video_id
       ORDER BY video_id;
    `;
    const { rows } = await pool.query(q, [userName]);
    return res.json({ results: rows });
  } catch (err) {
    console.error("❌ exam-results GET hatası:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

module.exports = router;
