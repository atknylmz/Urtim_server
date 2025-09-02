// routes/videos.js — PostgreSQL BYTEA + Range streaming (Express 5 uyumlu)

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const mime = require("mime");
const { pool } = require("../db");

const router = express.Router();

/* ============ Tabloyu garanti et (idempotent) ============ */
async function ensureVideosTable() {
  await pool.query(`
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
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos (created_at DESC);`
  );
}
ensureVideosTable().catch((e) => console.error("videos ensure hata:", e));

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
  const client = await pool.connect();
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

    await client.query("BEGIN");

    const saved = [];
    for (const f of req.files) {
      const filename = f.originalname || `upload-${uuidv4()}`;
      const mimeType = f.mimetype || mime.getType(filename) || "application/octet-stream";
      const sizeBytes = f.size;
      const content = f.buffer;

      const ins = await client.query(
        `INSERT INTO public.videos
          (title, description, uploader, tags, filename, mime_type, size_bytes, content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, title, description, uploader, tags, filename, mime_type, size_bytes, created_at`,
        [title, desc || null, uploader, normalizedTags, filename, mimeType, sizeBytes, content]
      );

      const row = ins.rows[0];
      const url = `${baseUrl(req)}/api/videos/${row.id}/stream`;
      await client.query(`UPDATE public.videos SET url = $1 WHERE id = $2`, [url, row.id]);

      saved.push({
        ...row,
        url,
        tags: Array.isArray(row.tags) ? row.tags : [],
      });
    }

    await client.query("COMMIT");
    res.status(201).json(saved);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Video yükleme hatası:", e);
    next(e);
  } finally {
    client.release();
  }
});

/* ============ LİSTE ============ */
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, description, uploader, tags, url, filename, mime_type, size_bytes, created_at
         FROM public.videos
        ORDER BY id DESC`
    );

    const b = baseUrl(req);
    const fixed = rows.map((v) => ({
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
      const { rows } = await pool.query(
        `SELECT mime_type, octet_length(content) AS total, content
           FROM public.videos
          WHERE id = $1`,
        [req.params.id]
      );
      const v = rows[0];
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

    const { rows: meta } = await pool.query(
      `SELECT mime_type, octet_length(content) AS total
         FROM public.videos
        WHERE id = $1`,
      [req.params.id]
    );
    const info = meta[0];
    if (!info) return res.status(404).json({ error: "Video bulunamadı" });

    const total = Number(info.total);
    const realEnd = end !== null ? Math.min(end, total - 1) : total - 1;
    const chunkSize = realEnd - start + 1;

    // BYTEA substring — 1-indexed
    const { rows } = await pool.query(
      `SELECT substring(content from $2 for $3) AS chunk
         FROM public.videos
        WHERE id = $1`,
      [req.params.id, start + 1, chunkSize]
    );
    const chunk = rows[0]?.chunk;
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
    const r = await pool.query(`DELETE FROM public.videos WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "Video bulunamadı" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
