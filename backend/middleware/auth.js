const jwt = require("jsonwebtoken");

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  header.split(/;\s*/).forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx < 0) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); }
      catch { out[k] = v; }
    }
  });
  return out;
}

function authenticateToken(req, res, next) {
  if (!req.cookies) req.cookies = parseCookies(req);
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ message: "Giriş yapılmamış" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      res.clearCookie("auth_token", { path: "/" });
      return res.status(401).json({ message: "Oturum süresi dolmuş" });
    }
    req.user = user;
    next();
  });
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ message: "Yetkiniz yok" });
  next();
}

module.exports = { authenticateToken, adminOnly, parseCookies };
