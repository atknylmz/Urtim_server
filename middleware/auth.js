import jwt from 'jsonwebtoken';

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET environment variable. Please set it in your .env file.");
  // In a real application, you might want to exit or handle this more gracefully.
  // For now, we'll throw an error to make it clear.
  throw new Error("Missing JWT_SECRET env");
}

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Yetkilendirme başlığı eksik veya hatalı" });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach user payload to request
    next();
  } catch (err) {
    console.error("Token doğrulama hatası:", err);
    return res.status(403).json({ error: "Geçersiz veya süresi dolmuş token" });
  }
};