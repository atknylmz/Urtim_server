// routes/videoExams.js
const express = require("express");
const multer = require("multer");
const mime = require("mime");
const { pool } = require("../db");   // ← tek havuz

const router = express.Router();

// Bellek tabanlı upload (BYTEA)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // gerekirse artır
});

// Tabloları garanti et (bir kez çalışır)
async function ensureExamTables() {
  // videos (BYTEA kolonlarıyla)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.videos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      uploader TEXT,
      tags TEXT[],
      filename TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      content BYTEA,
      url TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos (created_at DESC);`);

  // exams
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.exams (
      id SERIAL PRIMARY KEY,
      video_id INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      exam_title TEXT NOT NULL,
      author TEXT,
      tag TEXT,
      department TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // questions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.questions (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER REFERENCES public.exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text TEXT,
      image_url TEXT
    );
  `);
}
ensureExamTables().catch(e => console.error("ensureExamTables error:", e));

/* Video + Exam + Questions tek endpoint */
router.post("/", upload.single("file"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      title,
      desc,
      uploader,
      tags,
      examTitle,
      author,
      tag,
      department,
      questions
    } = req.body;

    if (!req.file) throw new Error("Video dosyası yüklenmedi");

    // tags -> array
    const tagsArray = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim())
      : [];

    // Video meta
    const filename = req.file.originalname || "upload.bin";
    const mimeType = req.file.mimetype || mime.getType(filename) || "application/octet-stream";
    const sizeBytes = req.file.size;
    const content = req.file.buffer;

    // 1) Video kaydı (BYTEA)
    const videoIns = await client.query(
      `INSERT INTO public.videos (title, description, uploader, tags, filename, mime_type, size_bytes, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [title, desc || null, uploader, tagsArray, filename, mimeType, sizeBytes, content]
    );
    const videoId = videoIns.rows[0].id;

    const base = `${req.protocol}://${req.get("host")}`;
    const streamUrl = `${base}/api/videos/${videoId}/stream`;
    await client.query(`UPDATE public.videos SET url = $1 WHERE id = $2`, [streamUrl, videoId]);

    // 2) Exam kaydı
    const examIns = await client.query(
      `INSERT INTO public.exams (video_id, exam_title, author, tag, department)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [videoId, examTitle, author, tag, department]
    );
    const examId = examIns.rows[0].id;

    // 3) Sorular
    const parsedQuestions = typeof questions === "string" ? JSON.parse(questions) : (questions || []);
    for (const q of parsedQuestions) {
      await client.query(
        `INSERT INTO public.questions (exam_id, question_text, answer_text, image_url)
         VALUES ($1,$2,$3,$4)`,
        [examId, q.q ?? q.question_text, q.a ?? q.answer_text, q.image ?? q.image_url ?? null]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      message: "Video + Sınav + Sorular kaydedildi",
      videoId,
      examId,
      url: streamUrl
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Kayıt hatası:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
