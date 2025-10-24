// routes/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../models/index.js'; // Sequelize db instance
 
const router = express.Router(); // Router instance
// en üstte:
const { JWT_SECRET, JWT_EXPIRES = '1d' } = process.env;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET env");


router.post("/login", async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Lütfen e-posta ve şifre alanlarını doldurun" });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase(); // Normalize email
    const [rows] = await db.sequelize.query( // Sequelize query returns [results, metadata]
      `SELECT id, username, email, authority, full_name, role, work_area, password_plain
         FROM public.users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      { bind: [normalizedEmail], type: db.sequelize.QueryTypes.SELECT }
    ); // rows is already an array of objects
    if (rows.length === 0) return res.status(404).json({ error: "Böyle bir kullanıcı bulunamadı" });

    const user = rows[0];

    // NOT: prod'da bcrypt kullanın (hashlenmemiş şifre test amaçlı).
    if (user.password_plain !== password) {
      return res.status(401).json({ error: "Yanlış şifre" });
    }

    if (role === "admin" && user.authority !== "admin") {
      return res.status(403).json({ error: "Bu hesaba admin panel erişimi yetkisi verilmemiş" });
    }
    if (role === "user" && !["admin", "user"].includes(user.authority)) {
      return res.status(403).json({ error: "Kullanıcı paneline giriş yetkiniz yok" });
    }

    const payload = { userId: user.id, username: user.username, email: user.email, authority: user.authority };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
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
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
