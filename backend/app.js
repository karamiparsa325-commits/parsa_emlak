const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const mysql = require("mysql2");

dotenv.config();

const app = express();

// --- Security Middleware ---
const JSONLD_HASH = "'sha256-VV5v4OCEttY4Dlp65Zh4nkK8KDHOPar7zTQ3oyQKScg='";
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", JSONLD_HASH],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'", "https://open.er-api.com"],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "upgrade-insecure-requests": [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

// CORS — allow comma-separated origins from FRONTEND_ORIGIN. When unset, fall back
// to localhost on the current PORT so the app Just Works locally without any config.
// (Browsers send an `Origin` header for POST/PUT/DELETE even on same-origin requests,
// so we can't rely on "no origin == same origin" alone.)
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
if (allowedOrigins.length === 0) {
  allowedOrigins.push(
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
  );
}
app.use(cors({
  origin: (origin, cb) => {
    // Same-origin requests (no Origin header) are always allowed.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS: origin not allowed: " + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: "100kb" }));

// Request logging — `dev` for human-readable local output, `combined` (Apache CLF) for prod
// aggregators. Skip /healthz so load-balancer polling doesn't drown the log.
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
  skip: (req) => req.url === "/healthz",
}));

// --- Database Connection Pool ---
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

// Verify connection
pool.promise().query("SELECT 1")
  .then(() => console.log("✅ MySQL pool connected"))
  .catch((err) => {
    console.error("❌ MySQL connection failed:", err.message);
    process.exit(1);
  });

// Schema lives in backend/db/schema.sql — apply it once before first boot.
// Don't create tables at runtime: that hides schema drift and lets bugs leak in.

// Health check — no auth, no logging. Returns 200 if the app can reach MySQL,
// 503 otherwise. Suitable for k8s readiness probes, uptime monitors, load
// balancers. Pings the pool directly (no req.db needed).
app.get("/healthz", async (req, res) => {
  try {
    await pool.promise().query("SELECT 1");
    res.json({ status: "ok", uptime: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

// Inject db pool into every request
app.use((req, res, next) => {
  req.db = pool.promise();
  next();
});

// --- Static Files with Cache-Control ---
// Default policy: short max-age + must-revalidate, so deploys propagate within
// minutes instead of after a full day. Uploads (immutable) get 7d, HTML always
// revalidates so its <script src=...?v=N> reference is always fresh.
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.includes(path.sep + "uploads" + path.sep)) {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // 7d
    } else if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    } else if (/\.(js|css|json|webmanifest)$/.test(filePath)) {
      // Revalidate every load — cheap (ETag → 304) and avoids stale-JS bugs.
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    }
  },
}));

// --- Routes ---
const authRoutes = require("./routes/auth");
const propertyRoutes = require("./routes/properties");
const uploadRoutes = require("./routes/upload");

app.use("/api", authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api", uploadRoutes);

// --- SPA Fallback: serve index.html for property detail pages ---
app.get("/property", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "property.html"));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);

  // Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "Dosya çok büyük! Maksimum 5MB." });
  }
  if (err.message && err.message.includes("resim dosyaları")) {
    return res.status(400).json({ message: err.message });
  }

  res.status(500).json({ message: "Sunucu hatası. Lütfen tekrar deneyin." });
});

module.exports = app;
