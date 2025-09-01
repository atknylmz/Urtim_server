const { Client } = require('pg');

const client = new Client({
  host: "192.168.0.220",
  port: 5433,
  user: "postgres",
  password: "123",
  database: "postgres"
});

async function migrate() {
  try {
    await client.connect();
    console.log("✅ PostgreSQL'e bağlandı.");

    // 1️⃣ uuid-ossp eklentisini aktif et
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 2️⃣ videos.id'yi UUID'e çevir
    await client.query(`
      ALTER TABLE exams DROP CONSTRAINT exams_video_id_fkey;
      ALTER TABLE videos ALTER COLUMN id DROP DEFAULT;
      ALTER TABLE videos ALTER COLUMN id TYPE uuid USING (uuid_generate_v4());
      ALTER TABLE videos ALTER COLUMN id SET DEFAULT uuid_generate_v4();
    `);

    // 3️⃣ exams.video_id'yi UUID'e çevir
    await client.query(`
      ALTER TABLE exams ALTER COLUMN video_id TYPE uuid USING (uuid_generate_v4());
      ALTER TABLE exams ADD CONSTRAINT exams_video_id_fkey FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
    `);

    console.log("✅ video_id ve id UUID olarak güncellendi.");
  } catch (err) {
    console.error("❌ Hata:", err);
  } finally {
    await client.end();
    console.log("🔌 Bağlantı kapatıldı.");
  }
}

migrate();
