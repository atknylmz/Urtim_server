import 'dotenv/config';
import db from './models/index.js'; // Sequelize db instance

(async () => {
  try {
    await db.sequelize.query(`ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS url TEXT;`);
    console.log("✅ 'url' kolonu eklendi veya zaten mevcut.");
  } catch (err) {
    console.error("🚨 Kolon ekleme hatası:", err.message);
    process.exit(1);
  }
})();
