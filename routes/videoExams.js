const express = require("express");
const multer = require("multer");
const path = require("path");
const { Pool } = require("pg");

const router = express.Router();
const pool = new Pool({
  host: "192.168.0.220",
  port: 5433,
  user: "postgres",
  password: "123",
  database: "postgres",
});

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

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

    const tagsArray = typeof tags === "string" ? tags.split(",").map(t => t.trim()) : tags;
    const filePath = `/uploads/${req.file.filename}`;
    const fileUrl = `${req.protocol}://${req.get("host")}${filePath}`;

    // 1️⃣ Video kaydı
    const videoResult = await client.query(
      `INSERT INTO videos (title, description, uploader, tags, file_path, url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [title, desc, uploader, tagsArray, filePath, fileUrl]
    );
    const videoId = videoResult.rows[0].id;

    // 2️⃣ Exam kaydı
    const examResult = await client.query(
      `INSERT INTO exams (video_id, exam_title, author, tag, department)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [videoId, examTitle, author, tag, department]
    );
    const examId = examResult.rows[0].id;

    // 3️⃣ Sorular kaydı
    const parsedQuestions = JSON.parse(questions);
    for (const q of parsedQuestions) {
      await client.query(
        `INSERT INTO questions (exam_id, question_text, answer_text, image_url)
         VALUES ($1, $2, $3, $4)`,
        [examId, q.q, q.a, q.image]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Video + Sınav + Sorular kaydedildi", videoId, examId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Kayıt hatası:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
