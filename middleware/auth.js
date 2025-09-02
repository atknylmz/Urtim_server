// middleware/auth.js
const jwt = require("jsonwebtoken");

// .env YÜKLEMEYİ server.js'te yapın (burada yapmayın)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET env");
}

// İsteğe bağlı: daha sıkı doğrulama için bu env'leri de tanımlayabilirsiniz
const JWT_ISSUER = process.env.JWT_ISSUER || undefined;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || undefined;

function extractToken(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h) return null;
  const parts = String(h).trim().split(" ").filter(Boolean);
  // "Bearer <token>"
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  // Postman vb. tek parça gönderirse "<token>"
  if (parts.length === 1) return parts[0];
  return null;
}

function verifyToken(req, res, next) {
  if (req.method === "OPTIONS") return next(); // CORS preflight

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Token gerekli", code: "token_required" });
  }

  jwt.verify(
    token,
    JWT_SECRET,
    {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5, // saniye
      // algorithms: ["HS256"], // isterseniz sabitleyin
    },
    (err, decoded) => {
      if (err) {
        const code = err.name === "TokenExpiredError" ? "token_expired" : "invalid_token";
        const status = err.name === "TokenExpiredError" ? 401 : 403;
        return res.status(status).json({ error: "Geçersiz ya da süresi dolmuş token", code });
      }
      // payload'ı normalize et
      req.user = {
        userId: decoded.userId ?? decoded.sub,
        username: decoded.username,
        email: decoded.email,
        authority: decoded.authority,
        ...decoded,
      };
      next();
    }
  );
}

function requireAuthority(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Kimlik doğrulaması gerekli", code: "unauthenticated" });
    }
    if (allowed.length && !allowed.includes(req.user.authority)) {
      return res.status(403).json({ error: "Bu işlem için yetkiniz yok", code: "forbidden" });
    }
    next();
  };
}

// (Opsiyonel) Token varsa user set et, yoksa devam et
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  jwt.verify(token, JWT_SECRET, { clockTolerance: 5 }, (err, decoded) => {
    if (!err && decoded) {
      req.user = { userId: decoded.userId ?? decoded.sub, ...decoded };
    }
    return next();
  });
}

module.exports = { verifyToken, requireAuthority, optionalAuth };
