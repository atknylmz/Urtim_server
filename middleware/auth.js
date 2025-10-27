// c:\Users\atakan.yilmaz\Desktop\Urtim_server\middleware\auth.js
import jwt from 'jsonwebtoken';
import config from '../config.js'; // JWT_SECRET'ı config dosyasından alıyoruz

const { JWT_SECRET } = config;

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Yetkilendirme token'ı bulunamadı." });
  }

  const token = authHeader.split(' ')[1]; // "Bearer TOKEN_STRING" formatından token'ı al

  if (!token) {
    return res.status(401).json({ error: "Yetkilendirme token'ı geçersiz formatta." });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET); // Token'ı doğrula ve çözümlenen veriyi req.user'a ata
    next(); // Doğrulama başarılı, bir sonraki middleware'e geç
  } catch (err) {
    // Token geçersizse veya süresi dolmuşsa JSON hata döndür
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Yetkilendirme token'ı süresi dolmuş." });
    }
    return res.status(403).json({ error: "Yetkilendirme token'ı geçersiz." });
  }
};
