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

// 📌 Sınav ve sorular ekleme endpoint'i
router.post("/", async (req, res) => {
  const { videoId, examTitle, author, tag, department, questions } = req.body;

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
        [examId, q.q, q.a, q.image || null]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ success: true, examId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🚨 Sınav ekleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  } finally {
    client.release();
  }
});

module.exports = router;
