// routes/examResults.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// Sınav sonucu kaydetme (kullanıcı ismi ile)
router.post("/", async (req, res) => {
  const { videoId, score, examTitle, userName } = req.body;

  // 🧪 Geçersiz veya eksik veri kontrolü
  if (!videoId || typeof score !== "number" || !examTitle || !userName?.trim()) {
    return res.status(400).json({ error: "Eksik veya geçersiz veri" });
  }

  try {
    const result = await db.query(
      `INSERT INTO exam_results ("user", video_id, exam_title, score)
       VALUES ($1, $2, $3, $4)
       RETURNING id, "user", video_id, exam_title, score, created_at`,
      [userName.trim(), videoId, examTitle.trim(), score]
    );

    return res.status(201).json({
      message: "✅ Sınav sonucu başarıyla kaydedildi",
      result: result.rows[0],
    });

  } catch (err) {
    console.error("❌ Sınav sonucu kayıt hatası:", err.message);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Kullanıcının (Ad Soyad) bazında her video için EN YÜKSEK puanı getir
router.get("/user/:userName", async (req, res) => {
  const userName = decodeURIComponent(req.params.userName || "");
  if (!userName.trim()) return res.status(400).json({ error: "userName gerekli" });

  try {
    const q = `
      SELECT video_id, MAX(score)::float AS score
      FROM exam_results
      WHERE "user" = $1
      GROUP BY video_id
      ORDER BY video_id;
    `;
    const { rows } = await db.query(q, [userName.trim()]);
    res.json({ results: rows }); // [{ video_id, score }]
  } catch (err) {
    console.error("❌ exam-results GET hatası:", err.message);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.get("/user/:userName", async (req, res) => {
  const userName = decodeURIComponent(req.params.userName || "");
  if (!userName.trim()) return res.status(400).json({ error: "userName gerekli" });

  try {
    const q = `
      SELECT video_id, MAX(score)::float AS score
      FROM exam_results
      WHERE LOWER("user") = LOWER($1)   -- ✅ büyük/küçük harf farkını yok say
      GROUP BY video_id
      ORDER BY video_id;
    `;
    const { rows } = await db.query(q, [userName.trim()]);
    res.json({ results: rows });
  } catch (err) {
    console.error("❌ exam-results GET hatası:", err.message);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


module.exports = router;
