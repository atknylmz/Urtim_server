// scripts/createAlterTable.js — Şema upgrade (idempotent)
require("dotenv").config();
const { pool } = require("../db");

async function run() {
  console.log("⏳ Şema upgrade başlıyor...");

  // USERS: yeni alanlar
  await pool.query(`
    ALTER TABLE IF EXISTS public.users
      ADD COLUMN IF NOT EXISTS email           TEXT,
      ADD COLUMN IF NOT EXISTS password_plain  TEXT,
      ADD COLUMN IF NOT EXISTS tags            TEXT[],
      ADD COLUMN IF NOT EXISTS school          TEXT,
      ADD COLUMN IF NOT EXISTS department      TEXT,
      ADD COLUMN IF NOT EXISTS watched_videos  INTEGER[] DEFAULT '{}'::INTEGER[];
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON public.users (lower(email));`);

  // VIDEOS: disk -> BYTEA kolonları
  await pool.query(`
    ALTER TABLE IF EXISTS public.videos
      ADD COLUMN IF NOT EXISTS filename   TEXT,
      ADD COLUMN IF NOT EXISTS mime_type  TEXT,
      ADD COLUMN IF NOT EXISTS size_bytes INTEGER,
      ADD COLUMN IF NOT EXISTS content    BYTEA,
      ADD COLUMN IF NOT EXISTS url        TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND indexname='videos_created_at_idx'
      ) THEN
        CREATE INDEX videos_created_at_idx ON public.videos (created_at DESC);
      END IF;
    END$$;
  `);

  // EXAMS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.exams (
      id SERIAL PRIMARY KEY,
      video_id   INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      exam_title TEXT NOT NULL,
      author     TEXT,
      tag        TEXT,
      department TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS exams_video_id_idx ON public.exams(video_id);`);

  // QUESTIONS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.questions (
      id SERIAL PRIMARY KEY,
      exam_id       INTEGER REFERENCES public.exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text   TEXT,
      image_url     TEXT
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS questions_exam_id_idx ON public.questions(exam_id);`);

  // EXAM_RESULTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.exam_results (
      id SERIAL PRIMARY KEY,
      "user"     TEXT NOT NULL,
      video_id   INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      exam_title TEXT,
      score      NUMERIC,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS exam_results_user_lower_idx ON public.exam_results (lower("user"));`);
  await pool.query(`CREATE INDEX IF NOT EXISTS exam_results_video_id_idx    ON public.exam_results (video_id);`);

  // USER_VIDEO_VIEWS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.user_video_views (
      id SERIAL PRIMARY KEY,
      user_id   INTEGER REFERENCES public.users(id)  ON DELETE CASCADE,
      video_id  INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      watched_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, video_id)
    );
  `);

  // USER_EDUCATION
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.user_education (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
      school TEXT,
      department TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  console.log("✅ Şema upgrade tamam.");
}

run()
  .catch(e => {
    console.error("❌ Upgrade hata:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch {}
    console.log("🔌 bağlantı kapandı.");
  });
