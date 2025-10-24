// routes/exams.js — tek PG pool + şema garantisi + validasyon
import express from 'express';
import db from '../models/index.js'; // Sequelize db instance
 
const router = express.Router();

/* ---------------------- ŞEMA GARANTİSİ ---------------------- */
async function ensureExamTables() {
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.exams (
      id SERIAL PRIMARY KEY,
      video_id   INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      exam_title TEXT NOT NULL,
      author     TEXT NOT NULL,
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
  `);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS exams_video_id_idx    ON public.exams(video_id);`);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS questions_exam_id_idx ON public.questions(exam_id);`);
  await db.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS exams_video_id_unique ON public.exams (video_id);`); // Her videonun sadece bir sınavı olabilir
 
  console.log("✅ exams & questions tabloları hazır");
}
ensureExamTables().catch(e => console.error("ensureExamTables error:", e));

/* ---------------- Sınav + sorular ekle ---------------- */
router.post("/", async (req, res) => {
  let { videoId, examTitle, author, tag, department, questions } = req.body || {};

  const vId = Number.parseInt(videoId, 10);
  if (!Number.isFinite(vId)) {
    return res.status(400).json({ error: "Geçersiz videoId (integer olmalı)" });
  }

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

  const t = await db.sequelize.transaction(); // Sequelize transaction
  try {
    // Check if an exam already exists for this videoId
    const [existingExam] = await db.sequelize.query(`SELECT id FROM public.exams WHERE video_id = $1`, { bind: [vId], transaction: t, type: db.sequelize.QueryTypes.SELECT });
    if (existingExam && existingExam.length > 0) return res.status(409).json({ error: "Bu videoya ait zaten bir sınav mevcut." });
 
    const [examIns] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `INSERT INTO public.exams (video_id, exam_title, author, tag, department)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`, // Düzeltme: transaction nesnesi bu sorguya da eklenmeli
      {
        bind: [vId, String(examTitle).trim(), String(author).trim(), String(tag).trim(), String(department).trim()],
        type: db.sequelize.QueryTypes.INSERT
      });
    const examId = examIns[0].id; // Düzeltildi: Sonuç işleme

    for (const q of questions) { // Use db.sequelize.query for INSERT
      await db.sequelize.query(
        `INSERT INTO public.questions (exam_id, question_text, answer_text, image_url) VALUES ($1,$2,$3,$4)`,
        {
          bind: [
            examId,
            (q?.q ?? q?.question_text ?? "").toString(),
            (q?.a ?? q?.answer_text ?? "").toString(),
            q?.image ?? q?.image_url ?? null,
          ],
          transaction: t
        });
    }
 
    // videonun tags'ine "SINAVLI" ekle (duplicate olmadan)
    await db.sequelize.query(`
      UPDATE public.videos
         SET tags = (
           SELECT ARRAY(
             SELECT DISTINCT t FROM unnest(COALESCE(tags, '{}') || ARRAY['SINAVLI']) AS t
           )
         )
       WHERE id = $1;`,
      { bind: [vId], transaction: t, type: db.sequelize.QueryTypes.UPDATE });
 
    await t.commit(); // Commit the transaction
    return res.status(201).json({ success: true, examId });
  } catch (err) {
    await t.rollback(); // Rollback the transaction
    console.error("🚨 Sınav ekleme hatası:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

/* ---------------- Belirli videoId'nin sınavını getir ---------------- */
router.get("/:videoId", async (req, res) => {
  const vId = Number.parseInt(req.params.videoId, 10);
  if (!Number.isFinite(vId)) return res.status(400).json({ error: "Geçersiz videoId" });

  try {
    const [examRes] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT id, exam_title, author, tag, department
         FROM public.exams
        WHERE video_id = $1
        ORDER BY id DESC LIMIT 1`, {
        bind: [vId], // Düzeltildi: bind parametresi
        type: db.sequelize.QueryTypes.SELECT
      });
    if (!examRes || examRes.length === 0) return res.status(404).json({ error: "Bu videoya ait sınav bulunamadı" });

    const exam = examRes[0]; // examRes[0] contains the actual row data
    const [qsRes] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT question_text AS q, answer_text AS a, image_url AS image
         FROM public.questions
        WHERE exam_id = $1
        ORDER BY id ASC`,
      { bind: [exam.id], type: db.sequelize.QueryTypes.SELECT }
    );

    return res.json({
      examTitle: exam.exam_title,
      author: exam.author,
      tag: exam.tag,
      department: exam.department,
      questions: qsRes, // qsRes is already an array of objects
    });
  } catch (err) {
    console.error("🚨 Sınav çekme hatası:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
