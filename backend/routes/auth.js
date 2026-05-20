const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { parseCookies } = require("../middleware/auth");
const { validate, RegisterSchema, LoginSchema } = require("../validation");

const router = express.Router();

// Cookie settings for the auth token. SameSite=Lax + httpOnly is the standard
// pattern: cookie is sent on top-level same-site navigation, never cross-site,
// and never readable from JS — so XSS can't exfiltrate it.
const COOKIE_NAME = "auth_token";
const COOKIE_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: COOKIE_TTL_MS,
  path: "/",
});

// Rate limit for auth endpoints — 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." },
  standardHeaders: true,
  legacyHeaders: false,
});

// REGISTER
router.post("/register", authLimiter, validate(RegisterSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await req.db.execute(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );

    res.json({ message: "Kayıt başarılı" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Kullanıcı zaten var" });
    }
    next(err);
  }
});

// LOGIN
router.post("/login", authLimiter, validate(LoginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const [results] = await req.db.execute(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (results.length === 0) {
      return res.status(401).json({ message: "Hatalı giriş" });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: "Hatalı giriş" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ role: user.role, username: user.username });
  } catch (err) {
    next(err);
  }
});

// LOGOUT — clears the cookie. Always 200 so the client can call it unconditionally.
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Çıkış yapıldı" });
});

// ME — returns the current session, or 401 if there is none.
router.get("/me", (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ message: "Giriş yapılmamış" });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ message: "Oturum süresi dolmuş" });
    }
    res.json({ username: user.username, role: user.role });
  });
});

module.exports = router;
