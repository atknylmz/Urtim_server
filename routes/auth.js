// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");            // ← tek havuz buradan
require("dotenv").config();

const router = express.Router();
const { JWT_SECRET, JWT_EXPIRES = "1d" } = process.env;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET env");

router.post("/login", async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Lütfen e-posta ve şifre alanlarını doldurun" });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      `SELECT id, username, email, authority, full_name, role, work_area, password_plain
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [normalizedEmail]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Böyle bir kullanıcı bulunamadı" });

    const user = rows[0];

    // TODO: prod'da bcrypt'e geçin. Şimdilik plain kıyas:
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

module.exports = router;
