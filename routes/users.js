// routes/users.js
const express = require("express");
const { Pool } = require("pg");
const verifyToken = require("../middleware/auth");

const router = express.Router();

const pool = new Pool({
  host: "192.168.0.220",
  port: 5433,
  user: "postgres",
  password: "123",
  database: "postgres",
});

/**
 * Helper: tags formatla (text[] sütununa uygun)
 * - Array gelirse {a,b,c} formatına çevir
 * - String gelirse tek elemanlı dizi gibi yaz
 * - Boşsa NULL
 */
function formatTags(tags) {
  if (Array.isArray(tags)) return `{${tags.map(String).join(",")}}`;
  if (typeof tags === "string" && tags.trim() !== "") return `{${tags}}`;
  return null;
}

/* ------------------------------------------------------------------ */
/* 📌 Kullanıcı ekleme                                                 */
/* ------------------------------------------------------------------ */
router.post("/", async (req, res) => {
  try {
    const {
      fullName,
      role,
      workArea,
      authority,
      username,
      email,
      password,
      tags = [],
      // 🆕 Eğitim alanları (opsiyonel)
      school = null,
      department = null,
    } = req.body;

    if (!fullName || !role || !workArea || !authority || !username || !email || !password) {
      return res.status(400).json({ error: "Eksik alanlar var" });
    }

    const existing = await pool.query(
      `SELECT 1 FROM users WHERE username = $1 OR email = $2`,
      [username, email]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Bu kullanıcı adı veya e-posta zaten kayıtlı" });
    }

    const result = await pool.query(
      `INSERT INTO users
         (full_name, role, work_area, authority, username, email, password_plain, tags, school, department)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING
         id, full_name, role, work_area, authority, username, email, password_plain, tags, school, department`,
      [
        fullName,
        role,
        workArea,
        authority,
        username,
        email,
        password,
        formatTags(tags),
        school,
        department,
      ]
    );

    const u = result.rows[0];
    res.status(201).json({
      id: u.id,
      fullName: u.full_name,
      role: u.role,
      workArea: u.work_area,
      authority: u.authority,
      username: u.username,
      email: u.email,
      password: u.password_plain,
      tags: u.tags || [],
      school: u.school || "",
      department: u.department || "",
    });
  } catch (err) {
    console.error("🚨 Kullanıcı ekleme hatası:", err);
    res.status(500).json({ error: "Kullanıcı eklenemedi", details: err.message });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Kullanıcıları listeleme                                          */
/* ------------------------------------------------------------------ */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, full_name, role, work_area, authority, username, email, password_plain, tags, school, department
      FROM users
      ORDER BY id ASC
    `);

    res.json(
      result.rows.map((u) => ({
        id: u.id,
        fullName: u.full_name,
        role: u.role,
        workArea: u.work_area,
        authority: u.authority,
        username: u.username,
        email: u.email,
        password: u.password_plain,
        tags: u.tags || [],
        school: u.school || "",
        department: u.department || "",
      }))
    );
  } catch (err) {
    console.error("🚨 Kullanıcıları çekerken hata:", err);
    res.status(500).json({ error: "Kullanıcılar alınamadı" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Kullanıcı silme                                                  */
/* ------------------------------------------------------------------ */
router.delete("/:username", async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE username = $1", [req.params.username]);
    res.json({ message: "Kullanıcı silindi" });
  } catch (err) {
    console.error("🚨 Kullanıcı silme hatası:", err);
    res.status(500).json({ error: "Kullanıcı silinemedi" });
  }
});

/* ------------------------------------------------------------------ */
/* 🆕 Eğitim Bilgisi (Okulu/Bölüm)                                     */
/* ------------------------------------------------------------------ */
// GET /api/users/:id/education
router.get("/:id/education", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const r = await pool.query(`SELECT school, department FROM users WHERE id = $1`, [userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ school: r.rows[0].school || "", department: r.rows[0].department || "" });
  } catch (err) {
    console.error("🚨 /education GET hatası:", err);
    res.status(500).json({ error: "Eğitim bilgisi alınamadı" });
  }
});

// PATCH /api/users/:id/education
router.patch("/:id/education", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  const { school = "", department = "" } = req.body;
  try {
    const r = await pool.query(
      `UPDATE users SET school = $1, department = $2 WHERE id = $3
       RETURNING id, school, department`,
      [school, department, userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ message: "Eğitim bilgisi güncellendi", user: r.rows[0] });
  } catch (err) {
    console.error("🚨 /education PATCH hatası:", err);
    res.status(500).json({ error: "Eğitim bilgisi güncellenemedi" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 İzlenen video (users.watched_videos alanı kullanan basit yöntem) */
/* ------------------------------------------------------------------ */
router.patch("/:id/watched", verifyToken, async (req, res) => {
  const { videoId } = req.body;
  const userId = parseInt(req.params.id, 10);

  if (!videoId) return res.status(400).json({ error: "videoId eksik" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const userResult = await pool.query(`SELECT watched_videos FROM users WHERE id = $1`, [userId]);
    const current = userResult.rows[0]?.watched_videos || [];

    if (current.includes(videoId)) {
      return res.json({ watchedVideos: current });
    }

    const updated = [...current, videoId];
    await pool.query(`UPDATE users SET watched_videos = $1 WHERE id = $2`, [updated, userId]);

    res.json({ watchedVideos: updated });
  } catch (err) {
    console.error("🚨 İzlenen video güncelleme hatası:", err);
    res.status(500).json({ error: "Güncellenemedi" });
  }
});

router.get("/:id/watched", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const result = await pool.query(`SELECT watched_videos FROM users WHERE id = $1`, [userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ watchedVideos: result.rows[0].watched_videos || [] });
  } catch (err) {
    console.error("🚨 İzlenen videoları alırken hata:", err);
    res.status(500).json({ error: "İzlenen videolar alınamadı" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 İzleme kaydı (user_video_views tablosu)                          */
/* ------------------------------------------------------------------ */
router.post("/:id/watched", verifyToken, async (req, res) => {
  const { videoId } = req.body;
  const userId = parseInt(req.params.id, 10);

  if (!videoId) return res.status(400).json({ error: "videoId gerekli" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const check = await pool.query(
      `SELECT 1 FROM user_video_views WHERE user_id = $1 AND video_id = $2`,
      [userId, videoId]
    );
    if (check.rowCount > 0) {
      return res.json({ message: "Zaten izlenmiş" });
    }

    await pool.query(
      `INSERT INTO user_video_views (user_id, video_id) VALUES ($1, $2)`,
      [userId, videoId]
    );

    res.json({ message: "Video izlenme bilgisi kaydedildi" });
  } catch (err) {
    console.error("🚨 İzleme kaydı hatası:", err);
    res.status(500).json({ error: "Kayıt başarısız" });
  }
});

router.get("/:id/watched-videos", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const result = await pool.query(
      `
      SELECT v.id, v.title, v.url, v.description
      FROM user_video_views uv
      JOIN videos v ON uv.video_id = v.id
      WHERE uv.user_id = $1
      ORDER BY uv.watched_at DESC
      `,
      [userId]
    );

    res.json({ watchedVideos: result.rows });
  } catch (err) {
    console.error("🚨 İzlenen videoları getirirken hata:", err);
    res.status(500).json({ error: "Veri alınamadı" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Kullanıcının workArea bilgisini getir                            */
/* ------------------------------------------------------------------ */
router.get("/:id/work-area", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const result = await pool.query(`SELECT work_area FROM users WHERE id = $1`, [userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ workArea: result.rows[0].work_area });
  } catch (err) {
    console.error("🚨 workArea çekilirken hata:", err);
    res.status(500).json({ error: "Work area alınamadı" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Kullanıcının eğitimleri (izlediği videolar + tag + best score)   */
/* ------------------------------------------------------------------ */
router.get("/:id/trainings", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const q = `
      SELECT
        v.id,
        v.title,
        v.tags,
        COALESCE(MAX(er.score), NULL) AS score
      FROM user_video_views uv
      JOIN videos v        ON uv.video_id = v.id
      JOIN users u         ON u.id = uv.user_id
      LEFT JOIN exam_results er
             ON er.video_id = v.id
            AND er."user" = u.full_name
      WHERE uv.user_id = $1
      GROUP BY v.id, v.title, v.tags
      ORDER BY MAX(uv.watched_at) DESC;
    `;
    const { rows } = await pool.query(q, [userId]);

    const normalizeTags = (tags) => {
      if (Array.isArray(tags)) return tags.map(String);
      if (typeof tags === "string") {
        return tags
          .replace(/[{}"\\]/g, "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
      return [];
    };

    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      tags: normalizeTags(r.tags),
      score: r.score === null ? null : Number(r.score),
    }));

    res.json({ trainings: data });
  } catch (err) {
    console.error("🚨 /:id/trainings hatası:", err);
    res.status(500).json({ error: "Eğitimler getirilemedi" });
  }
});

// --- Çoklu Eğitim Bilgisi: Listeyi getir ---
router.get("/:id/education-list", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const q = `SELECT id, school, department, created_at FROM user_education WHERE user_id = $1 ORDER BY created_at DESC, id DESC`;
    const { rows } = await pool.query(q, [userId]);
    res.json({ entries: rows });
  } catch (err) {
    console.error("🚨 education-list GET hatası:", err);
    res.status(500).json({ error: "Eğitim bilgileri alınamadı" });
  }
});

// --- Çoklu Eğitim Bilgisi: Tüm listeyi replace ederek kaydet ---
router.put("/:id/education-list", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  const { entries } = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "entries array olmalı" });
  }

  // Veri temizliği
  const clean = entries
    .map((e) => ({
      school: String(e.school || "").trim(),
      department: String(e.department || "").trim(),
    }))
    .filter((e) => e.school && e.department);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM user_education WHERE user_id = $1`, [userId]);

    for (const e of clean) {
      await client.query(
        `INSERT INTO user_education (user_id, school, department) VALUES ($1,$2,$3)`,
        [userId, e.school, e.department]
      );
    }

    await client.query("COMMIT");

    const r = await pool.query(
      `SELECT id, school, department, created_at FROM user_education WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
      [userId]
    );
    res.json({ message: "Eğitim bilgileri kaydedildi", entries: r.rows });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🚨 education-list PUT hatası:", err);
    res.status(500).json({ error: "Eğitim bilgileri kaydedilemedi" });
  } finally {
    client.release();
  }
});


module.exports = router;
