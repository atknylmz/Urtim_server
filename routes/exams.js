// routes/exams.js
const express = require("express");
const { Pool } = require("pg");

const router = express.Router();
const pool = new Pool({
  host: "192.168.0.220",
  port: 5433,
  user: "postgres",
  password: "123",
  database: "postgres",
});

// 📌 Sınav ekleme + soruları ekleme + videoya SINAVLI tag ekleme
router.post("/", async (req, res) => {
  let { videoId, examTitle, author, tag, department, questions } = req.body;

  // Gelen videoId integer mı kontrol et
  if (!Number.isInteger(videoId)) {
    const parsedId = parseInt(videoId, 10);
    if (isNaN(parsedId)) {
      return res.status(400).json({ error: "Geçersiz videoId (integer olmalı)" });
    }
    videoId = parsedId;
  }

  // Sorular JSON string olarak gelmişse parse et
  if (typeof questions === "string") {
    try {
      questions = JSON.parse(questions);
    } catch {
      return res.status(400).json({ error: "Sorular geçerli JSON formatında değil" });
    }
  }

  // Boş alan kontrolü
  if (!videoId || !examTitle || !author || !tag || !department || !Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ error: "Eksik veri gönderildi" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ exams tablosuna ekle
    const examResult = await client.query(
      `INSERT INTO exams (video_id, exam_title, author, tag, department) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [videoId, examTitle, author, tag, department]
    );
    const examId = examResult.rows[0].id;

    // 2️⃣ questions tablosuna ekle
    for (const q of questions) {
      await client.query(
        `INSERT INTO questions (exam_id, question_text, answer_text, image_url) 
         VALUES ($1, $2, $3, $4)`,
        [examId, q.q || "", q.a || "", q.image || null]
      );
    }

    // 3️⃣ Videonun tags alanına SINAVLI ekle (duplicate olmadan)
    await client.query(
      `UPDATE videos
       SET tags = (
         SELECT ARRAY(
           SELECT DISTINCT t
           FROM unnest(
             COALESCE(tags, '{}') || ARRAY['SINAVLI']
           ) AS t
         )
       )
       WHERE id = $1`,
      [videoId]
    );

    await client.query("COMMIT");

    res.status(201).json({ 
      message: "Sınav, sorular ve video tag güncellendi", 
      examId 
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Sınav ekleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  } finally {
    client.release();
  }
});

// 📌 Belirli bir video ID'ye ait sınav ve soruları çek
router.get("/:videoId", async (req, res) => {
  const { videoId } = req.params;

  try {
    // 1️⃣ Sınav bilgilerini çek
    const examRes = await pool.query(
      "SELECT * FROM exams WHERE video_id = $1 LIMIT 1",
      [videoId]
    );

    if (examRes.rows.length === 0) {
      return res.status(404).json({ error: "Bu videoya ait sınav bulunamadı" });
    }

    const exam = examRes.rows[0];

    // 2️⃣ Soruları çek
    const questionsRes = await pool.query(
      `SELECT question_text AS q, answer_text AS a, image_url AS image
       FROM questions
       WHERE exam_id = $1`,
      [exam.id]
    );

    res.json({
      examTitle: exam.exam_title,
      author: exam.author,
      tag: exam.tag,
      department: exam.department,
      questions: questionsRes.rows
    });

  } catch (err) {
    console.error("❌ Sınav çekme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

module.exports = router;
