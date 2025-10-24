// routes/users.js
import express from 'express';
import db from '../models/index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/* ---------------------- ŞEMA GARANTİSİ ---------------------- */
async function ensureUserTables() {
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id SERIAL PRIMARY KEY,
      full_name      TEXT NOT NULL,
      role           TEXT NOT NULL,
      work_area      TEXT,
      authority      TEXT,
      username       TEXT UNIQUE NOT NULL,
      email          TEXT UNIQUE NOT NULL,
      password_plain TEXT,
      tags           TEXT[],
      school         TEXT,
      department     TEXT,
      watched_videos INTEGER[] DEFAULT '{}'::INTEGER[]
    );
  `); // No transaction needed for ensure tables
  await db.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON public.users (username);`);
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.user_video_views (
      id SERIAL PRIMARY KEY,
      user_id   INTEGER REFERENCES public.users(id)  ON DELETE CASCADE,
      video_id  INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      watched_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, video_id)
    );
  `); // No transaction needed for ensure tables

  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.user_education (
      id SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
      school     TEXT,
      department TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON public.users (lower(email));`); // No transaction needed for ensure tables
  console.log("✅ users / user_video_views / user_education tabloları hazır");
}
ensureUserTables().catch((e) => console.error("ensureUserTables error:", e));

/* -------------------------- Yardımcı -------------------------- */
function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}
const normAuth = (v) => (String(v || "").toLowerCase() === "admin" ? "admin" : "user");

const camelize = (u) => ({
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

/* ---------------- Kullanıcı ekle ---------------- */
router.post("/", async (req, res) => {
  try {
    const {
      fullName, role, workArea, authority, username, email, password,
      tags = [], school = null, department = null,
    } = req.body || {};

    if (!fullName || !role || !workArea || !authority || !username || !email || !password) {
      return res.status(400).json({ error: "Eksik alanlar var" });
    }

    const [existing] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT 1 FROM public.users WHERE username = $1 OR email = $2`,
      { bind: [username, email], type: db.sequelize.QueryTypes.SELECT }
    );
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Bu kullanıcı adı veya e-posta zaten kayıtlı" });
    }

    const [result] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `INSERT INTO public.users
         (full_name, role, work_area, authority, username, email, password_plain, tags, school, department)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, full_name, role, work_area, authority, username, email, password_plain, tags, school, department`, // Düzeltildi: type eklendi
      [fullName, role, workArea, normAuth(authority), username, email, password, normalizeTags(tags), school, department]
    );

    res.status(201).json(camelize(result[0])); // result[0] contains the actual row data
  } catch (err) {
    console.error("🚨 Kullanıcı ekleme hatası:", err);
    res.status(500).json({ error: "Kullanıcı eklenemedi", details: err.message });
  }
});

/* ---------------- Kullanıcıları listele ---------------- */
router.get("/", async (_req, res) => {
  try {
    const [results] = await db.sequelize.query(`
      SELECT id, full_name, role, work_area, authority, username, email, password_plain, tags, school, department
        FROM public.users
       ORDER BY id ASC
    `, { type: db.sequelize.QueryTypes.SELECT });
    res.json(results.map(camelize)); // results is already an array of objects
  } catch (err) {
    console.error("🚨 Kullanıcıları çekerken hata:", err);
    res.status(500).json({ error: "Kullanıcılar alınamadı" });
  }
});

/* ---------------- Kullanıcı güncelle (PUT /:id) ---------------- */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Geçersiz id" });

  try {
    const {
      fullName, role, workArea, authority, username, email, password, tags,
      school, department,
    } = req.body || {};

    // benzersizlik kontrolü (kendi dışındakiler)
    if (username || email) {
      const [r] = await db.sequelize.query( // Sequelize query returns [results, metadata]
        `SELECT 1 FROM public.users WHERE (username = $1 OR email = $2) AND id <> $3`,
        { bind: [username || null, email || null, id], type: db.sequelize.QueryTypes.SELECT } // Düzeltildi: type eklendi
      );
      if (r && r.length > 0) {
        return res.status(409).json({ error: "Bu kullanıcı adı veya e-posta başka bir kullanıcıda mevcut" });
      }
    }

    // dinamik SET listesi
    const fields = [];
    const values = [];
    let i = 1;

    if (fullName !== undefined) { fields.push(`full_name = $${i++}`); values.push(fullName); }
    if (role !== undefined)      { fields.push(`role = $${i++}`); values.push(role); }
    if (workArea !== undefined)  { fields.push(`work_area = $${i++}`); values.push(workArea); }
    if (authority !== undefined) { fields.push(`authority = $${i++}`); values.push(normAuth(authority)); }
    if (username !== undefined)  { fields.push(`username = $${i++}`); values.push(username); }
    if (email !== undefined)     { fields.push(`email = $${i++}`); values.push(email); }
    if (Array.isArray(tags) || typeof tags === "string") {
      fields.push(`tags = $${i++}`); values.push(normalizeTags(tags));
    }
    if (school !== undefined)    { fields.push(`school = $${i++}`); values.push(school); }
    if (department !== undefined){ fields.push(`department = $${i++}`); values.push(department); }
    // password boş/undefined ise dokunma
    if (password) { fields.push(`password_plain = $${i++}`); values.push(password); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "Güncellenecek alan yok" });
    }

    values.push(id);
    const q = `
      UPDATE public.users
         SET ${fields.join(", ")}
       WHERE id = $${i}
       RETURNING id, full_name, role, work_area, authority, username, email, password_plain, tags, school, department`;
    const [updated] = await db.sequelize.query(q, { bind: values, type: db.sequelize.QueryTypes.UPDATE });
    if (!updated || updated.length === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    res.json(camelize(updated[0]));
  } catch (err) {
    console.error("🚨 Kullanıcı güncelleme hatası:", err);
    res.status(500).json({ error: "Kullanıcı güncellenemedi", details: err.message });
  }
});

/* ---------------- Kullanıcı sil (DELETE /:id veya /:username) ---------------- */
router.delete("/:idOrUsername", async (req, res) => {
  try {
    const p = req.params.idOrUsername;
    const asNum = Number(p);

    let r;
    if (Number.isInteger(asNum)) {
      [r] = await db.sequelize.query(`DELETE FROM public.users WHERE id = $1 RETURNING id`, { bind: [asNum], type: db.sequelize.QueryTypes.DELETE }); // Düzeltildi: type eklendi
    } else {
      [r] = await db.sequelize.query(`DELETE FROM public.users WHERE username = $1 RETURNING id`, { bind: [p], type: db.sequelize.QueryTypes.DELETE }); // Düzeltildi: type eklendi
    }

    if (!r || r.length === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" }); // r is the array of affected rows
    res.json({ message: "Kullanıcı silindi" });
  } catch (err) {
    console.error("🚨 Kullanıcı silme hatası:", err);
    res.status(500).json({ error: "Kullanıcı silinemedi" });
  }
});

/* ----------- Eğitim (tekil) ----------- */
router.get("/:id/education", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const [r] = await db.sequelize.query(`SELECT school, department FROM public.users WHERE id = $1`, { bind: [userId], type: db.sequelize.QueryTypes.SELECT }); // Düzeltildi: type eklendi
    if (r && r.length === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ school: r[0].school || "", department: r[0].department || "" }); // r[0] is the actual row data
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
    const [r] = await db.sequelize.query(
      `UPDATE public.users SET school = $1, department = $2 WHERE id = $3
       RETURNING id, school, department`,
      { bind: [school, department, userId], type: db.sequelize.QueryTypes.UPDATE }
    );
    if (!r || r.length === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ message: "Eğitim bilgisi güncellendi", user: r[0][0] }); // r[0][0] contains the actual row data
  } catch (err) {
    console.error("🚨 /education PATCH hatası:", err.message);
    res.status(500).json({ error: "Eğitim bilgisi güncellenemedi" });
  }
});

/* ----------- Education list ----------- */
router.get("/:id/education-list", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const q = `SELECT id, school, department, created_at
                 FROM public.user_education
                WHERE user_id = $1
             ORDER BY created_at DESC, id DESC`;
    const [rows] = await db.sequelize.query(q, { bind: [userId], type: db.sequelize.QueryTypes.SELECT }); // Düzeltildi: type eklendi
    res.json({ entries: rows }); // rows is already an array of objects
  } catch (err) {
    console.error("🚨 education-list GET hatası:", err);
    res.status(500).json({ error: "Eğitim bilgileri alınamadı" });
  }
});

router.put("/:id/education-list", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  const { entries } = req.body || {};
  if (!Array.isArray(entries)) return res.status(400).json({ error: "entries array olmalı" });

  const clean = entries
    .map(e => ({ school: String(e.school || "").trim(), department: String(e.department || "").trim() }))
    .filter(e => e.school && e.department);

  const t = await db.sequelize.transaction(); // Sequelize transaction
  try {
    await db.sequelize.query(`DELETE FROM public.user_education WHERE user_id = $1`, { bind: [userId], transaction: t, type: db.sequelize.QueryTypes.DELETE }); // Düzeltildi: type eklendi

    for (const e of clean) {
      await db.sequelize.query(
        `INSERT INTO public.user_education (user_id, school, department) VALUES ($1, $2, $3)`,
        { bind: [userId, e.school, e.department], transaction: t }
      );
    }

    await t.commit(); // Commit the transaction

    const [r] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT id, school, department, created_at
         FROM public.user_education
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC`,
      { bind: [userId], type: db.sequelize.QueryTypes.SELECT } // Düzeltildi: type eklendi
    );
    res.json({ message: "Eğitim bilgileri kaydedildi", entries: r }); // r is already an array of objects
  } catch (err) {
    await t.rollback(); // Rollback the transaction
    console.error("🚨 education-list PUT hatası:", err);
    res.status(500).json({ error: "Eğitim bilgileri kaydedilemedi" });
  }
});

/* ----------- İzlenenler (alan + log) ----------- */
router.patch("/:id/watched", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const vidId = Number(req.body?.videoId);
  if (!Number.isFinite(vidId)) return res.status(400).json({ error: "videoId eksik/hatalı" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const [r] = await db.sequelize.query(`SELECT watched_videos FROM public.users WHERE id = $1`, { bind: [userId], type: db.sequelize.QueryTypes.SELECT }); // Düzeltildi: type eklendi
    const current = Array.isArray(r[0]?.watched_videos) ? r[0].watched_videos : []; // r[0] is the actual row data
    if (current.includes(vidId)) return res.json({ watchedVideos: current });

    const updated = [...current, vidId];
    await db.sequelize.query(`UPDATE public.users SET watched_videos = $1 WHERE id = $2`, { bind: [updated, userId], type: db.sequelize.QueryTypes.UPDATE }); // Düzeltildi: type eklendi
    res.json({ watchedVideos: updated });
  } catch (err) {
    console.error("🚨 İzlenen video güncelleme hatası:", err);
    res.status(500).json({ error: "Güncellenemedi" });
  }
});

/* ----------- İzleme kaydı (tek POST, idempotent) ----------- */
router.post("/:id/watched", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const vidId  = Number(req.body?.videoId);
  if (!Number.isFinite(vidId)) return res.status(400).json({ error: "videoId gerekli" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  const t = await db.sequelize.transaction(); // Sequelize transaction
  try {

    const [cur] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT watched_videos FROM public.users WHERE id = $1 FOR UPDATE`,
      { bind: [userId], transaction: t, type: db.sequelize.QueryTypes.SELECT } // Düzeltildi: type eklendi
    );

    if (!cur || cur.length === 0) {
      await t.rollback(); // Rollback the transaction
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }
    const arr = Array.isArray(cur[0].watched_videos) ? cur[0].watched_videos : []; // cur[0] is the actual row data
    if (!arr.includes(vidId)) {
      await db.sequelize.query(
        `UPDATE public.users SET watched_videos = $1 WHERE id = $2`, // Düzeltildi: type eklendi
        [[...arr, vidId], userId]
      );
    }

    await db.sequelize.query( // Use db.sequelize.query for INSERT
      `INSERT INTO public.user_video_views (user_id, video_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, video_id) DO NOTHING`,
      { bind: [userId, vidId], transaction: t, type: db.sequelize.QueryTypes.INSERT } // Düzeltildi: type eklendi
    );

    await t.commit(); // Commit the transaction

    const [out] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT watched_videos FROM public.users WHERE id = $1`,
      { bind: [userId], type: db.sequelize.QueryTypes.SELECT } // Düzeltildi: type eklendi
    );
    return res.status(201).json({
      message: "İzleme bilgisi kaydedildi",
      watchedVideos: Array.isArray(out[0]?.watched_videos) ? out[0].watched_videos : [] // out[0] is the actual row data
    });
  } catch (err) {
    await t.rollback(); // Rollback the transaction
    console.error("🚨 İzleme kaydı hatası:", err);
    res.status(500).json({ error: "Kayıt başarısız" });
  }
});

router.get("/:id/watched", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const [r] = await db.sequelize.query(`SELECT watched_videos FROM public.users WHERE id = $1`, { bind: [userId], type: db.sequelize.QueryTypes.SELECT }); // Düzeltildi: type eklendi
    if (!r || r.length === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ watchedVideos: Array.isArray(r[0].watched_videos) ? r[0].watched_videos : [] }); // r[0] is the actual row data
  } catch (err) {
    console.error("🚨 İzlenen videoları alırken hata:", err);
    res.status(500).json({ error: "İzlenen videolar alınamadı" });
  }
});

router.get("/:id/watched-videos", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const [r] = await db.sequelize.query(
      `SELECT v.id, v.title, v.url, v.description
         FROM public.user_video_views uv
         JOIN public.videos v ON uv.video_id = v.id
        WHERE uv.user_id = $1 ORDER BY uv.watched_at DESC`,
      { bind: [userId], type: db.sequelize.QueryTypes.SELECT } // Düzeltildi: type eklendi
    );
    res.json({ watchedVideos: r });
  } catch (err) {
    console.error("🚨 İzlenen videoları getirirken hata:", err);
    res.status(500).json({ error: "Veri alınamadı" });
  }
});

/* ----------- Work Area ----------- */
router.get("/:id/work-area", verifyToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.userId !== userId) return res.status(403).json({ error: "Erişim reddedildi" });

  try {
    const [r] = await db.sequelize.query(`SELECT work_area FROM public.users WHERE id = $1`, { bind: [userId], type: db.sequelize.QueryTypes.SELECT }); // Düzeltildi: type eklendi
    if (!r || r.length === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ workArea: r[0].work_area }); // r[0] is the actual row data
  } catch (err) {
    console.error("🚨 workArea çekilirken hata:", err);
    res.status(500).json({ error: "Work area alınamadı" });
  }
});

/* ----------- Eğitimler (etiket + skor) ----------- */
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
       WHERE uv.user_id = $1 GROUP BY v.id, v.title, v.tags ORDER BY MAX(uv.watched_at) DESC`;
    const [rows] = await db.sequelize.query(q, { bind: [userId], type: db.sequelize.QueryTypes.SELECT }); // Düzeltildi: type eklendi
    
    const format = (tags) =>
      Array.isArray(tags)
        ? tags.map(String)
        : typeof tags === "string"
        ? tags.replace(/[{}"\\]/g, "").split(",").map((t) => t.trim()).filter(Boolean)
        : [];

    res.json({
      trainings: rows.map((r) => ({
        id: r.id,
        title: r.title,
        tags: format(r.tags),
        score: r.score === null ? null : Number(r.score),
      })),
    });
  } catch (err) {
    console.error("🚨 /:id/trainings hatası:", err);
    res.status(500).json({ error: "Eğitimler getirilemedi" });
  }
});

export default router;
