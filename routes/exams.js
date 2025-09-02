// routes/exams.js — tek PG pool + şema garantisi + güvenli validasyon
const express = require("express");
const { pool } = require("../db");
// istersen korumalı yap: const { verifyToken, requireAuthority } = require("../middleware/auth");

const router = express.Router();

/* ---------------------- ŞEMA GARANTİSİ ---------------------- */
async function ensureExamTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.exams (
      id SERIAL PRIMARY KEY,
      video_id   INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      exam_title TEXT NOT NULL,
      author     TEXT,
      tag        TEXT,
      department TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.questions (
      id SERIAL PRIMARY KEY,
      exam_id       INTEGER REFERENCES public.exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text   TEXT,
      image_url     TEXT
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS exams_video_id_idx    ON public.exams(video_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS questions_exam_id_idx ON public.questions(exam_id);`);

  console.log("✅ exams & questions tabloları hazır");
}
ensureExamTables().catch(e => console.error("ensureExamTables error:", e));

/* ---------------- Sınav + sorular ekle (+ videoya SINAVLI etiketi) ---------------- */
// router.post("/", verifyToken, requireAuthority("admin"), async (req, res) => {
router.post("/", async (req, res) => {
  let { videoId, examTitle, author, tag, department, questions } = req.body || {};

  // videoId -> integer
  const vId = Number.parseInt(videoId, 10);
  if (!Number.isFinite(vId)) {
    return res.status(400).json({ error: "Geçersiz videoId (integer olmalı)" });
  }

  // questions parse
  if (typeof questions === "string") {
    try { questions = JSON.parse(questions); }
    catch { return res.status(400).json({ error: "Sorular geçerli JSON değil" }); }
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Sorular boş olamaz" });
  }

  if (!examTitle || !author || !tag || !department) {
    return res.status(400).json({ error: "Eksik alanlar var (examTitle/author/tag/department)" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) exams
    const examIns = await client.query(
      `INSERT INTO public.exams (video_id, exam_title, author, tag, department)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [vId, String(examTitle).trim(), String(author).trim(), String(tag).trim(), String(department).trim()]
    );
    const examId = examIns.rows[0].id;

    // 2) questions
    for (const q of questions) {
      await client.query(
        `INSERT INTO public.questions (exam_id, question_text, answer_text, image_url)
         VALUES ($1,$2,$3,$4)`,
        [
          examId,
          (q?.q ?? q?.question_text ?? "").toString(),
          (q?.a ?? q?.answer_text ?? "").toString(),
          q?.image ?? q?.image_url ?? null,
        ]
      );
    }

    // 3) videonun tags'ine "SINAVLI" ekle (duplicate olmadan)
    await client.query(`
      UPDATE public.videos
         SET tags = (
           SELECT ARRAY(
             SELECT DISTINCT t
               FROM unnest(COALESCE(tags, '{}') || ARRAY['SINAVLI']) AS t
           )
         )
       WHERE id = $1;
    `, [vId]);

    await client.query("COMMIT");
    return res.status(201).json({ success: true, examId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🚨 Sınav ekleme hatası:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  } finally {
    client.release();
  }
});

/* ---------------- Belirli videoId'nin sınavını getir (+ sorular) ---------------- */
router.get("/:videoId", async (req, res) => {
  const vId = Number.parseInt(req.params.videoId, 10);
  if (!Number.isFinite(vId)) return res.status(400).json({ error: "Geçersiz videoId" });

  try {
    const examRes = await pool.query(
      `SELECT id, exam_title, author, tag, department
         FROM public.exams
        WHERE video_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [vId]
    );
    if (examRes.rowCount === 0) return res.status(404).json({ error: "Bu videoya ait sınav bulunamadı" });

    const exam = examRes.rows[0];
    const qsRes = await pool.query(
      `SELECT question_text AS q, answer_text AS a, image_url AS image
         FROM public.questions
        WHERE exam_id = $1
        ORDER BY id ASC`,
      [exam.id]
    );

    return res.json({
      examTitle: exam.exam_title,
      author: exam.author,
      tag: exam.tag,
      department: exam.department,
      questions: qsRes.rows,
    });
  } catch (err) {
    console.error("🚨 Sınav çekme hatası:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

module.exports = router;
