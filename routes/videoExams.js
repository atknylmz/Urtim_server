// routes/videoExams.js — Video + Exam + Questions tek endpoint (BYTEA)
import express from 'express';
import multer from 'multer';
import mime from 'mime'; // mime is still needed for mimetype detection
import db from '../models/index.js'; // Sequelize db instance

const router = express.Router();

/* ============ Tabloları garanti et (idempotent) ============ */
async function ensureExamTables() {
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.videos (
      id SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      uploader    TEXT,
      tags        TEXT[],
      filename    TEXT,
      mime_type   TEXT,
      size_bytes  INTEGER,
      content     BYTEA,
      url         TEXT,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos (created_at DESC);`);

  await db.sequelize.query(`
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

  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.questions (
      id SERIAL PRIMARY KEY,
      exam_id       INTEGER REFERENCES public.exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text   TEXT,
      image_url     TEXT
    );
  `); // No transaction needed for ensure tables
  console.log("✅ videoExams tabloları hazır");
}
ensureExamTables().catch(e => console.error("ensureExamTables error:", e));

/* ============ Upload ============ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

/* ============ Video + Exam + Questions ============ */
router.post("/", upload.single("file"), async (req, res, next) => { // Added next for error handling
  const t = await db.sequelize.transaction(); // Sequelize transaction
  try {

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
    } = req.body || {};

    if (!req.file) throw new Error("Video dosyası yüklenmedi");
    if (!title || !uploader) throw new Error("Başlık ve yükleyici zorunlu");

    const tagsArray = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags.split(",").map(t => t.trim()).filter(Boolean)
      : [];

    const filename  = req.file.originalname || "upload.bin";
    const mimeType  = req.file.mimetype || mime.getType(filename) || "application/octet-stream";
    const sizeBytes = req.file.size;
    const content   = req.file.buffer;

    // 1) Video
    const [videoIns] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `INSERT INTO public.videos (title, description, uploader, tags, filename, mime_type, size_bytes, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      {
        replacements: [title, desc || null, uploader, tagsArray, filename, mimeType, sizeBytes, content],
        transaction: t,
        type: db.sequelize.QueryTypes.INSERT
      });
    const videoId = videoIns[0].id; // Düzeltildi: Sonuç işleme

    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const streamUrl = `${base}/api/videos/${videoId}/stream`;
    await db.sequelize.query(`UPDATE public.videos SET url = $1 WHERE id = $2`, { bind: [streamUrl, videoId], transaction: t, type: db.sequelize.QueryTypes.UPDATE }); // Düzeltildi: db.sequelize.query kullanıldı
 
    // 2) Exam
    if (!examTitle || !author || !tag || !department) {
      throw new Error("Sınav alanları eksik (examTitle/author/tag/department)"); // This will be caught by the catch block
    }
    const [examIns] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `INSERT INTO public.exams (video_id, exam_title, author, tag, department)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      {
        replacements: [videoId, String(examTitle).trim(), String(author).trim(), String(tag).trim(), String(department).trim()],
        transaction: t,
        type: db.sequelize.QueryTypes.INSERT
      });
    const examId = examIns[0].id; // Düzeltildi: Sonuç işleme
 
    // 3) Sorular (Use db.sequelize.query for INSERT)
    const parsedQuestions = typeof questions === "string" ? JSON.parse(questions) : (questions || []); // Ensure questions is an array
    for (const q of parsedQuestions) { // Use db.sequelize.query for INSERT
      await db.sequelize.query(
        `INSERT INTO public.questions (exam_id, question_text, answer_text, image_url)
         VALUES ($1,$2,$3,$4)`,
        { bind: [examId, q.q ?? q.question_text, q.a ?? q.answer_text, q.image ?? q.image_url ?? null], transaction: t }
      );
    }

    await t.commit(); // Commit the transaction
    res.status(201).json({
      message: "Video + Sınav + Sorular kaydedildi",
      videoId, examId, url: streamUrl
    });
  } catch (err) {
    await t.rollback(); // Düzeltildi: Sequelize transaction rollback
    console.error("Kayıt hatası:", err);
    next(err); // Pass error to global error handler
  }
});

export default router;
