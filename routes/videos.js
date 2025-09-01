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

const createTableQuery = `
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  uploader VARCHAR(100),
  tags TEXT[],
  file_path VARCHAR(255) NOT NULL,
  url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function initializeDatabase() {
  try {
    await pool.query(createTableQuery);
    console.log("✅ Videos tablosu hazır");
  } catch (err) {
    console.error("❌ Tablo oluşturulamadı:", err);
  }
}
initializeDatabase();

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1000 * 1024 * 1024 }
});

router.post("/", upload.array("file"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Dosya yüklenmedi" });
    }

    const { title, desc, uploader, tags } = req.body;

    if (!title || !uploader) {
      return res.status(400).json({ error: "Başlık ve yükleyici zorunlu" });
    }
// tags verisi string veya array olabilir
let tagsArray = Array.isArray(tags)
  ? tags
  : typeof tags === "string"
  ? tags.split(",").map(t => t.trim())
  : [];

// Eğer frontend'den group bilgisi geliyorsa buradan formatla
// Örn: req.body.group = "Microsoft Outlook Kullanımı"
if (req.body.group) {
  tagsArray = tagsArray.map(tag =>
    tag.includes(">") ? tag : `${req.body.group} > ${tag}`
  );
}



    // 🔹 savedVideos burada tanımlanmalı
    const savedVideos = [];

for (const file of req.files) {
  if (!file.filename) continue;

  const filePath = `/uploads/${file.filename}`;
  const fileUrl = `${req.protocol}://${req.get("host")}${filePath}`;

  const result = await pool.query(
    `INSERT INTO videos (title, description, uploader, tags, file_path, url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [title, desc, uploader, tagsArray, filePath, fileUrl]
  );

  const video = result.rows[0];

  // 🔹 Tags her zaman array olsun
  video.tags = Array.isArray(video.tags)
    ? video.tags
    : typeof video.tags === "string"
      ? [video.tags]
      : [];

  savedVideos.push(video);
}


    res.status(201).json(savedVideos);
  } catch (err) {
    console.error("Sunucu hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, uploader, tags, file_path, url
       FROM videos
       ORDER BY id DESC`
    );

    const rows = result.rows.map(v => {
      let tagsArray = [];

      // PostgreSQL text[] zaten array ise
      if (Array.isArray(v.tags)) {
        tagsArray = v.tags.map(t => String(t).trim());
      }
      // Eğer "{tag1,tag2}" formatında string geldiyse
      else if (typeof v.tags === "string") {
        tagsArray = v.tags
  .toString()
  .replace(/[{}"\\]/g, "") // \ ve " ve {} karakterlerini sil
  .split(",")
  .map(t => t.trim())
  .filter(Boolean);

      }

      return {
        ...v,
        tags: tagsArray
      };
    });

    res.json(rows);
  } catch (err) {
    console.error("🚨 Videolar alınamadı:", err);
    res.status(500).json({ error: "Videolar alınamadı" });
  }
});


// 📌 Video silme
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM videos WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Video bulunamadı" });
    }
    res.json({ message: "Video silindi", deleted: result.rows[0] });
  } catch (err) {
    console.error("🚨 Video silme hatası:", err);
    res.status(500).json({ error: "Video silinemedi" });
  }
});


module.exports = router;
