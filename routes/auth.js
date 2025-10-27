// routes/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../models/index.js'; // Sequelize db instance
import { QueryTypes } from 'sequelize'; // ÖNEMLİ: SELECT dönüşünü doğru yorumlamak için

const router = express.Router();

const { JWT_SECRET, JWT_EXPIRES = '1d' } = process.env;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET env");

// Body parser'ın app seviyesinde aktif olduğundan emin ol:
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

router.post("/login", async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Lütfen e-posta ve şifre alanlarını doldurun" });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    // NOT: QueryTypes.SELECT ile sonuç DOĞRUDAN satır dizisidir (metadata yok).
    const rows = await db.sequelize.query(
      `
      SELECT id, username, email, authority, full_name, role, work_area, password_plain
        FROM public.users
       WHERE LOWER(email) = $1
       LIMIT 1
      `,
      { bind: [normalizedEmail], type: QueryTypes.SELECT }
    );

    if (!rows || rows.length === 0) {
      // Kullanıcı yoksa burada dön; ileride user.password_plain okunmaz.
      return res.status(404).json({ error: "Böyle bir kullanıcı bulunamadı" });
    }

    const user = rows[0];

    // Test ortamında düz şifre karşılaştırması (prod'da bcrypt kullanın)
    if (user.password_plain == null) {
      return res.status(500).json({ error: "Kullanıcı şifre alanı eksik" });
    }
    if (String(user.password_plain) !== String(password)) {
      return res.status(401).json({ error: "Yanlış şifre" });
    }

    // Rol/authority uyumu
    if (role === "admin" && user.authority !== "admin") {
      return res.status(403).json({ error: "Bu hesaba admin panel erişimi yetkisi verilmemiş" });
    }
    if (role === "user" && !["admin", "user"].includes(user.authority)) {
      return res.status(403).json({ error: "Kullanıcı paneline giriş yetkiniz yok" });
    }

    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      authority: user.authority
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    return res.json({
      message: `${role === "admin" ? "Admin" : "Kullanıcı"} girişi başarılı`,
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        authority: user.authority,
        role: user.role,
        workArea: user.work_area,
      },
    });
  } catch (e) {
    console.error("Login hatası:", e);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
