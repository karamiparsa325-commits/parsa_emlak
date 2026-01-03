const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const path = require("path");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Güvenlik Politikası (Chrome hatasını engellemek için)
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// --- ÜYELİK ROTALARI ---

// 1. KAYIT OL (REGISTER)
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  // Varsayılan rol 'user' olarak kaydedilir
  db.query(
    "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')",
    [username, password],
    (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res
            .status(400)
            .json({ message: "Bu kullanıcı adı zaten alınmış." });
        return res.status(500).json(err);
      }
      res.json({ message: "Kayıt Başarılı! Şimdi giriş yapabilirsiniz." });
    }
  );
});

// 2. GİRİŞ YAP (LOGIN)

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, results) => {
      if (err) return res.status(500).json(err);

      if (results.length > 0) {
        const user = results[0];

        // --- BU SATIRI EKLE (HİLE) ---
        if (user.username === "admin") user.role = "admin";
        // -----------------------------

        const token = jwt.sign(
          { username: user.username, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "2h" }
        );
        return res.json({ token, role: user.role, username: user.username });
      }

      // Veritabanında yoksa, Hardcoded Admin kontrolü (Yedek)
      if (username === "admin" && password === "admin123") {
        const token = jwt.sign(
          { username: "admin", role: "admin" },
          process.env.JWT_SECRET,
          { expiresIn: "2h" }
        );
        return res.json({ token, role: "admin", username: "Admin" });
      }

      res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı!" });
    }
  );
});

// --- İLAN ROTALARI ---

// İlanları Getir
app.get("/api/properties", (req, res) => {
  db.query("SELECT * FROM properties ORDER BY id DESC", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

// Middleware: Sadece Admin Yetkisi Olanlar
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    // Sadece admin yazma/silme yapabilir
    if (req.method !== "GET" && user.role !== "admin")
      return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// İlan Ekle
app.post("/api/properties", authenticateToken, (req, res) => {
  const { title, location, price, type, image } = req.body;
  db.query(
    "INSERT INTO properties (title, location, price, type, image) VALUES (?, ?, ?, ?, ?)",
    [title, location, price, type, image],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "OK" });
    }
  );
});

// İlan Güncelle
app.put("/api/properties/:id", authenticateToken, (req, res) => {
  const { title, location, price, type, image } = req.body;
  db.query(
    "UPDATE properties SET title=?, location=?, price=?, type=?, image=? WHERE id=?",
    [title, location, price, type, image, req.params.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "OK" });
    }
  );
});

// İlan Sil
app.delete("/api/properties/:id", authenticateToken, (req, res) => {
  db.query("DELETE FROM properties WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "Deleted" });
  });
});

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`)
);
