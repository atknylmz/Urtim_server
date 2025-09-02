// routes/users.js  — tek PG pool + şema garantisi + sağlamlaştırmalar
const express = require("express");
const { pool } = require("../db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

/* ---------------------- ŞEMA GARANTİSİ (bir kez çalışır) ---------------------- */
async function ensureUserTables() {
  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id SERIAL PRIMARY KEY,
      full_name    TEXT NOT NULL,
      role         TEXT,
      work_area    TEXT,
      authority    TEXT,
      username     TEXT UNIQUE NOT NULL,
      email        TEXT UNIQUE NOT NULL,
      password_plain TEXT,
      tags         TEXT[],
      school       TEXT,
      department   TEXT,
      watched_videos INTEGER[] DEFAULT '{}'::INTEGER[]
    );
  `);

  // kullanıcı-video izleme kayıtları
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.user_video_views (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES public.users(id)   ON DELETE CASCADE,
      video_id INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      watched_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, video_id)
    );
  `);

  // çoklu eğitim kayıtları
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.user_education (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
      school TEXT,
      department TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  console.log("✅ users/user_video_views/user_education tabloları hazır");
}
ensureUserTables().catch((e) => console.error("ensureUserTables error:", e));

/* -------------------------- Yardımcı: tag normalizasyonu -------------------------- */
function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
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
      password, // not: prod'da hash'leyin
      tags = [],
      school = null,
      department = null,
    } = req.body || {};

    if (!fullName || !role || !workArea || !authority || !username || !email || !password) {
      return res.status(400).json({ error: "Eksik alanlar var" });
    }

    const existing = await pool.query(
      `SELECT 1 FROM public.users WHERE username = $1 OR email = $2`,
      [username, email]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Bu kullanıcı adı veya e-posta zaten kayıtlı" });
    }

    const tagsArr = normalizeTags(tags);

    const result = await pool.query(
      `INSERT INTO public.users
         (full_name, role, work_area, authority, username, email, password_plain, tags, school, department)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING
         id, full_name, role, work_area, authority, username, email, password_plain, tags, school, department`,
      [fullName, role, workArea, authority, username, email, password, tagsArr, school, department]
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
      tags: Array.isArray(u.tags) ? u.tags : [],
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
      SELECT id, full_name, role, work_area, authority, username, email, password_plain, tags, school, department
        FROM public.users
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
        tags: Array.isArray(u.tags) ? u.tags : [],
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
    await pool.query(`DELETE FROM public.users WHERE username = $1`, [req.params.username]);
    res.json({ message: "Kullanıcı silindi" });
  } catch (err) {
    console.error("🚨 Kullanıcı silme hatası:", err);
    res.status(500).json({ error: "Kullanıcı silinemedi" });
  }
});

/* ------------------------------------------------------------------ */
/* 🆕 Eğitim Bilgisi (Okulu/Bölüm)                                     */
/* ------------------------------------------------------------------ */
router.get("/:id/education", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const r = await pool.query(`SELECT school, department FROM public.users WHERE id = $1`, [userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ school: r.rows[0].school || "", department: r.rows[0].department || "" });
  } catch (err) {
    console.error("🚨 /education GET hatası:", err);
    res.status(500).json({ error: "Eğitim bilgisi alınamadı" });
  }
});

router.patch("/:id/education", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  const { school = "", department = "" } = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE public.users SET school = $1, department = $2 WHERE id = $3
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
/* 📌 İzlenen video (users.watched_videos alanı)                       */
/* ------------------------------------------------------------------ */
router.patch("/:id/watched", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const vidId = Number(req.body?.videoId);
  if (!Number.isFinite(vidId)) return res.status(400).json({ error: "videoId eksik/hatalı" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const userResult = await pool.query(`SELECT watched_videos FROM public.users WHERE id = $1`, [userId]);
    const current = Array.isArray(userResult.rows[0]?.watched_videos) ? userResult.rows[0].watched_videos : [];
    if (current.includes(vidId)) return res.json({ watchedVideos: current });

    const updated = [...current, vidId];
    await pool.query(`UPDATE public.users SET watched_videos = $1 WHERE id = $2`, [updated, userId]);
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
    const result = await pool.query(`SELECT watched_videos FROM public.users WHERE id = $1`, [userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ watchedVideos: Array.isArray(result.rows[0].watched_videos) ? result.rows[0].watched_videos : [] });
  } catch (err) {
    console.error("🚨 İzlenen videoları alırken hata:", err);
    res.status(500).json({ error: "İzlenen videolar alınamadı" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 İzleme kaydı (user_video_views)                                  */
/* ------------------------------------------------------------------ */
router.post("/:id/watched", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const vidId = Number(req.body?.videoId);
  if (!Number.isFinite(vidId)) return res.status(400).json({ error: "videoId gerekli" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const check = await pool.query(
      `SELECT 1 FROM public.user_video_views WHERE user_id = $1 AND video_id = $2`,
      [userId, vidId]
    );
    if (check.rowCount > 0) return res.json({ message: "Zaten izlenmiş" });

    await pool.query(
      `INSERT INTO public.user_video_views (user_id, video_id) VALUES ($1, $2)`,
      [userId, vidId]
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
        FROM public.user_video_views uv
        JOIN public.videos v ON uv.video_id = v.id
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
    const result = await pool.query(`SELECT work_area FROM public.users WHERE id = $1`, [userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ workArea: result.rows[0].work_area });
  } catch (err) {
    console.error("🚨 workArea çekilirken hata:", err);
    res.status(500).json({ error: "Work area alınamadı" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Kullanıcının eğitimleri (etiket + en iyi skor)                   */
/* ------------------------------------------------------------------ */
router.get("/:id/trainings", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const q = `
      SELECT v.id, v.title, v.tags, COALESCE(MAX(er.score), NULL) AS score
        FROM public.user_video_views uv
        JOIN public.videos v ON uv.video_id = v.id
        JOIN public.users  u ON u.id = uv.user_id
        LEFT JOIN public.exam_results er
               ON er.video_id = v.id
              AND er."user" = u.full_name
       WHERE uv.user_id = $1
       GROUP BY v.id, v.title, v.tags
       ORDER BY MAX(uv.watched_at) DESC
    `;
    const { rows } = await pool.query(q, [userId]);

    const format = (tags) =>
      Array.isArray(tags)
        ? tags.map(String)
        : typeof tags === "string"
        ? tags.replace(/[{}"\\]/g, "").split(",").map((t) => t.trim()).filter(Boolean)
        : [];

    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      tags: format(r.tags),
      score: r.score === null ? null : Number(r.score),
    }));

    res.json({ trainings: data });
  } catch (err) {
    console.error("🚨 /:id/trainings hatası:", err);
    res.status(500).json({ error: "Eğitimler getirilemedi" });
  }
});

/* ------------------------------------------------------------------ */

module.exports = router;
