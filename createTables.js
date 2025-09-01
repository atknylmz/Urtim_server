const { Client } = require('pg');

const client = new Client({
  host: "192.168.0.220",
  port: 5433,
  user: "postgres",
  password: "123",
  database: "postgres"
});

const createTables = async () => {
  try {
    await client.connect();
    console.log("✅ PostgreSQL'e bağlandı.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        work_area VARCHAR(255) NOT NULL,
        authority VARCHAR(50) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        tags TEXT[],
        uploader VARCHAR(255),
        file_path TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        video_id INT REFERENCES videos(id) ON DELETE CASCADE,
        exam_title VARCHAR(255) NOT NULL,
        author VARCHAR(255) NOT NULL,
        tag VARCHAR(255),
        department VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        exam_id INT REFERENCES exams(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        answer_text TEXT NOT NULL,
        image_url TEXT
      );
    `);

    console.log("✅ Tablolar başarıyla oluşturuldu.");
  } catch (err) {
    console.error("❌ Hata:", err);
  } finally {
    await client.end();
    console.log("🔌 Bağlantı kapatıldı.");
  }
};

createTables();
