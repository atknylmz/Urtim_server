// middleware/auth.js
require("dotenv").config();
const jwt = require("jsonwebtoken");

// ❗ Fallback yok
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET env");

function verifyToken(req, res, next) {
  if (req.method === "OPTIONS") return next();

  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const parts = authHeader.split(" ").filter(Boolean);

  let token = null;
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) token = parts[1];
  else if (parts.length === 1 && parts[0] && !parts[0].includes(" ")) token = parts[0];

  if (!token) {
    return res.status(401).json({ error: "Token gerekli", code: "token_required" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token süresi doldu", code: "token_expired" });
      }
      return res.status(403).json({ error: "Geçersiz token", code: "invalid_token" });
    }
    req.user = decoded;
    next();
  });
}

module.exports = verifyToken;
module.exports.requireAuthority = function requireAuthority(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Kimlik doğrulaması gerekli" });
    if (!allowed.includes(req.user.authority)) {
      return res.status(403).json({ error: "Bu işlem için yetkiniz yok" });
    }
    next();
  };
};
