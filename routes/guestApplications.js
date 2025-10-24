import express from 'express';
import db from '../models/index.js';

const router = express.Router();

// models/index.js'deki top-level await sayesinde, bu dosya import edildiğinde
// db nesnesi ve modeller zaten hazır durumdadır.
const GuestApplication = db.GuestApplication;

// Tüm başvuruları listelemek için GET rotası
router.get('/', async (req, res) => {
  try {
    if (!GuestApplication) {
      return res.status(503).json({ message: 'Veritabanı henüz hazır değil, lütfen tekrar deneyin.' });
    }

    // Tüm başvuruları veritabanından çek (en yeniden eskiye doğru sırala)
    const applications = await GuestApplication.findAll({
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json(applications);
  } catch (error) {
    console.error('Başvurular alınamadı:', error);
    res.status(500).json({ message: 'Başvurular alınırken bir sunucu hatası oluştu.', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!GuestApplication) {
      return res.status(503).json({ message: 'Veritabanı henüz hazır değil, lütfen tekrar deneyin.' });
    }

    // 1. Veritabanına kaydet
    const application = await GuestApplication.create(req.body);

    res.status(201).json({ message: 'Başvurunuz başarıyla alındı.', data: application });
  } catch (error) {
    console.error('Başvuru kaydedilemedi:', error);
    res.status(500).json({ message: 'Başvuru sırasında bir sunucu hatası oluştu.', error: error.message });
  }
});

export default router;