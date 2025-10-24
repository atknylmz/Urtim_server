// routes/videos.js — PostgreSQL BYTEA + Range streaming (Express 5 uyumlu)

import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime';
import db from '../models/index.js'; // Sequelize db instance

const router = express.Router();

/* ============ Tabloyu garanti et (idempotent) ============ */
async function ensureVideosTable() {
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
  `); // No transaction needed for ensure tables
  await db.sequelize.query(
    `CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos (created_at DESC);`
  );
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS videos_tags_gin ON public.videos USING GIN (tags);`);
}
ensureVideosTable().catch((e) => console.error("videos ensure hata:", e));
// yardımcılar
const titleCase = (s="") =>
  String(s).toLowerCase().split(" ").filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
const deptTag = (wa) => {
  const t = titleCase(String(wa || "").trim());
  return t ? `DEPARTMAN > ${t}` : null;
};
/* ============ Upload ayarları (BYTEA için RAM) ============ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

/* ============ URL üretimi ============ */
function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

/* ============ YÜKLE (çoklu dosya) ============ 
   form-data: file (multi), title, desc, uploader, tags ("a,b" veya array), group (opsiyonel)
*/
router.post("/", upload.array("file"), async (req, res, next) => {
  const t = await db.sequelize.transaction(); // Sequelize transaction
  try {
    if (!req.files?.length) return res.status(400).json({ error: "Dosya yüklenmedi" });

    const { title, desc, uploader, tags, group } = req.body || {};
    if (!title || !uploader) return res.status(400).json({ error: "Başlık ve yükleyici zorunlu" });

    let tagsArray = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const normalizedTags = tagsArray
      .map((t) => {
        const s = String(t).trim();
        return group && s && !s.includes(">") ? `${group} > ${s}` : s;
      })
      .filter(Boolean);

    const saved = [];
    for (const f of req.files) {
      const filename = f.originalname || `upload-${uuidv4()}`;
      const mimeType = f.mimetype || mime.getType(filename) || "application/octet-stream";
      const sizeBytes = f.size;
      const content = f.buffer;

      const [ins] = await db.sequelize.query(
        `INSERT INTO public.videos
          (title, description, uploader, tags, filename, mime_type, size_bytes, content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, title, description, uploader, tags, filename, mime_type, size_bytes, created_at`,
        { bind: [title, desc || null, uploader, normalizedTags, filename, mimeType, sizeBytes, content], transaction: t }
      );

      const row = ins[0];
      const url = `${baseUrl(req)}/api/videos/${row.id}/stream`;
      await db.sequelize.query(`UPDATE public.videos SET url = $1 WHERE id = $2`, { bind: [url, row.id], transaction: t });

      saved.push({
        ...row,
        url,
        tags: Array.isArray(row.tags) ? row.tags : []
      });
    }

    await t.commit();
    res.status(201).json(saved);
  } catch (e) {
    if (t) await t.rollback();
    console.error("Video yükleme hatası:", e);
    next(e);
  }
});

/* ============ LİSTE ============ */
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.sequelize.query(
      `SELECT id, title, description, uploader, tags, url, filename, mime_type, size_bytes, created_at
         FROM public.videos
        ORDER BY id DESC`
    , { type: db.sequelize.QueryTypes.SELECT });

    const b = baseUrl(req);
    const fixed = rows.map(v => ({
      ...v,
      url: v.url || `${b}/api/videos/${v.id}/stream`,
      tags: Array.isArray(v.tags)
        ? v.tags.map((t) => String(t).trim())
        : typeof v.tags === "string"
        ? v.tags
            .toString()
            .replace(/[{}"\\]/g, "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    }));

    res.json(fixed);
  } catch (e) {
    console.error("Videolar alınamadı:", e);
    next(e);
  }
});

/* ============ STREAM (Range destekli) ============ */
router.get("/:id/stream", async (req, res, next) => {
  try {
    const range = req.headers.range;

    if (!range) {
      // Tam dosya
      const [rows] = await db.sequelize.query( // Sequelize query returns [results, metadata]
        `SELECT mime_type, octet_length(content) AS total, content
           FROM public.videos
          WHERE id = $1`,
        { bind: [req.params.id], type: db.sequelize.QueryTypes.SELECT }
      );
      const v = rows[0]; // rows[0] contains the actual row data
      if (!v) return res.status(404).json({ error: "Video bulunamadı" });

      const total = Number(v.total);
      res.setHeader("Content-Type", v.mime_type || "application/octet-stream");
      res.setHeader("Content-Length", total);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes 0-${total - 1}/${total}`);
      return res.end(v.content);
    }

    // bytes=start-end
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (!m) return res.status(416).end();

    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : null;

    const [meta] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT mime_type, octet_length(content) AS total
         FROM public.videos
        WHERE id = $1`,
      { bind: [req.params.id], type: db.sequelize.QueryTypes.SELECT }
    );
    const info = meta[0]; // meta[0] contains the actual row data
    if (!info) return res.status(404).json({ error: "Video bulunamadı" });

    const total = Number(info.total);
    const realEnd = end !== null ? Math.min(end, total - 1) : total - 1;
    const chunkSize = realEnd - start + 1;

    // BYTEA substring — 1-indexed
    const [rows] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT substring(content from $2 for $3) AS chunk
         FROM public.videos
        WHERE id = $1`,
      { bind: [req.params.id, start + 1, chunkSize], type: db.sequelize.QueryTypes.SELECT }
    );
    const chunk = rows[0]?.chunk; // rows[0] contains the actual row data
    if (!chunk) return res.status(404).end();

    res.status(206);
    res.setHeader("Content-Type", info.mime_type || "application/octet-stream");
    res.setHeader("Content-Range", `bytes ${start}-${realEnd}/${total}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", chunkSize);
    return res.end(chunk);
  } catch (e) {
    next(e);
  }
});

/* ============ SİL ============ */
router.delete("/:id", async (req, res, next) => {
  try {
    const [r] = await db.sequelize.query(`DELETE FROM public.videos WHERE id = $1 RETURNING id`, { bind: [req.params.id], type: db.sequelize.QueryTypes.DELETE });
    if (!r || r.length === 0) return res.status(404).json({ error: "Video bulunamadı" }); // r is the array of affected rows
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ============ ÖNERİLEN VİDEOLAR: /api/videos/recommended/:userId ============ */
router.get("/recommended/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Geçersiz userId" });

    // kullanıcının work_area + tags
    const [u] = await db.sequelize.query(`SELECT work_area, tags FROM public.users WHERE id = $1`, { bind: [userId], type: db.sequelize.QueryTypes.SELECT });
    if (!u || u.length === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const userTags = Array.isArray(u[0].tags) ? u[0].tags : []; // u[0] is the actual row data
    const autoDept = deptTag(u[0].work_area); // "DEPARTMAN > Depo" gibi
    const needles = [...new Set([...userTags, autoDept].filter(Boolean))];
    if (!needles.length) return res.json([]); // kullanıcının hiç etiketi yoksa boş

    const needlesLower = needles.map(s => s.toLowerCase());
    const likePatterns = needlesLower.map(s => `%${s}%`);

    const [rows] = await db.sequelize.query(
      `
      SELECT id, title, description, uploader, tags, url, filename, mime_type, size_bytes, created_at
        FROM public.videos v
       WHERE EXISTS (
              SELECT 1 FROM unnest(v.tags) t
               WHERE lower(t) = ANY($1) OR lower(t) LIKE ANY($2)
             )
       ORDER BY id DESC
      `, { bind: [needlesLower, likePatterns] }
    );

    const b = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const out = rows.map(v => ({
      ...v,
      url: v.url || `${b}/api/videos/${v.id}/stream`,
      tags: Array.isArray(v.tags)
        ? v.tags.map(t => String(t).trim())
        : typeof v.tags === "string"
        ? v.tags.toString().replace(/[{}"\\]/g, "").split(",").map(t => t.trim()).filter(Boolean)
        : [],
    }));
    res.json(out);
  } catch (e) { next(e); }
});

export default router;
