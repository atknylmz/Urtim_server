// createTable.js — tek pool ile idempotent şema kurulumu / yükseltme
import 'dotenv/config';

import db from './models/index.js'; // Sequelize db instance

async function main() {
  console.log("⏳ DB init/upgrade başlıyor...");

  /* USERS */
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id SERIAL PRIMARY KEY,
      full_name      TEXT NOT NULL,
      role           TEXT,
      work_area      TEXT,
      authority      TEXT,
      username       TEXT UNIQUE NOT NULL,
      email          TEXT UNIQUE,
      password_plain TEXT,
      tags           TEXT[],
      school         TEXT,
      department     TEXT,
      watched_videos INTEGER[] DEFAULT '{}'::INTEGER[]
    );
  `);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON public.users (lower(email));`);

  /* VIDEOS (BYTEA içerik + stream URL) */
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.videos (
      id          SERIAL PRIMARY KEY,
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
 
  // Eski şemadan gelen sütunları (ör. file_path NOT NULL) tolere et
  await db.sequelize.query(`
    ALTER TABLE IF EXISTS public.videos
      ADD COLUMN IF NOT EXISTS filename   TEXT,
      ADD COLUMN IF NOT EXISTS mime_type  TEXT,
      ADD COLUMN IF NOT EXISTS size_bytes INTEGER,
      ADD COLUMN IF NOT EXISTS content    BYTEA,
      ADD COLUMN IF NOT EXISTS url        TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
  `);
 
  // Varsa eski file_path sütunundaki NOT NULL zorlamasını kaldır (varsa!)
  await db.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='videos' AND column_name='file_path'
      ) THEN
        BEGIN
          ALTER TABLE public.videos ALTER COLUMN file_path DROP NOT NULL;
        EXCEPTION WHEN undefined_column THEN
          -- yoksa sorun yok
          NULL;
        END;
      END IF;
    END$$;
  `);

  await db.sequelize.query(`
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

  /* EXAMS */
  await db.sequelize.query(`
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
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS exams_video_id_idx ON public.exams (video_id);`);

  /* QUESTIONS */
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.questions (
      id SERIAL PRIMARY KEY,
      exam_id       INTEGER REFERENCES public.exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text   TEXT,
      image_url     TEXT
    );
  `);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS questions_exam_id_idx ON public.questions (exam_id);`);

  /* EXAM_RESULTS */
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.exam_results (
      id          SERIAL PRIMARY KEY,
      "user"      TEXT NOT NULL,
      video_id    INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      exam_title  TEXT,
      score       NUMERIC,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS exam_results_user_lower_idx ON public.exam_results (lower("user"));`);
  await db.sequelize.query(`CREATE INDEX IF NOT EXISTS exam_results_video_id_idx    ON public.exam_results (video_id);`);

  /* USER_VIDEO_VIEWS */
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.user_video_views (
      id SERIAL PRIMARY KEY,
      user_id   INTEGER REFERENCES public.users(id)  ON DELETE CASCADE,
      video_id  INTEGER REFERENCES public.videos(id) ON DELETE CASCADE,
      watched_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, video_id)
    );
  `);

  /* USER_EDUCATION */
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.user_education (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
      school TEXT,
      department TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  console.log("✅ DB init/upgrade tamam.");
}

main()
  .catch((e) => {
    console.error("❌ DB init hata:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log("🔌 Bağlantı kapatıldı (Sequelize tarafından yönetiliyor).");
  });
