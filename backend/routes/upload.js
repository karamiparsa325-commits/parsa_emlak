const express = require("express");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const { authenticateToken, adminOnly } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer — store in memory for sharp processing
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Sadece resim dosyaları yüklenebilir!"));
    }
  },
});

/**
 * Compress and save image using sharp
 * - Max width 1200px
 * - Quality 80
 * - Convert to WebP for best compression
 */
async function processAndSave(buffer, originalName) {
  const filename = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.webp`;
  const outputPath = path.join(UPLOAD_DIR, filename);

  await sharp(buffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outputPath);

  return `/uploads/${filename}`;
}

// Single image upload
router.post("/upload", authenticateToken, adminOnly, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Dosya yüklenemedi" });
    const url = await processAndSave(req.file.buffer, req.file.originalname);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// Multi-image upload (up to 10)
router.post("/upload-multi", authenticateToken, adminOnly, upload.array("images", 10), async (req, res, next) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ message: "Dosya yüklenemedi" });
    const urls = await Promise.all(
      req.files.map((f) => processAndSave(f.buffer, f.originalname))
    );
    res.json({ urls });
  } catch (err) {
    next(err);
  }
});

// Add images to a property
router.post("/properties/:id/images", authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const { urls } = req.body;
    if (!urls || !urls.length) return res.status(400).json({ message: "URL gerekli" });
    const values = urls.map((url, i) => [req.params.id, url, i]);
    await req.db.query(
      "INSERT INTO property_images (property_id, image_url, sort_order) VALUES ?",
      [values]
    );
    res.json({ message: "Resimler eklendi" });
  } catch (err) {
    next(err);
  }
});

// Delete a single image (also removes file from disk)
router.delete("/images/:id", authenticateToken, adminOnly, async (req, res, next) => {
  try {
    // Get image URL before deleting
    const [rows] = await req.db.execute(
      "SELECT image_url FROM property_images WHERE id=?",
      [req.params.id]
    );
    if (rows.length > 0) {
      const filePath = path.join(__dirname, "..", "public", rows[0].image_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await req.db.execute("DELETE FROM property_images WHERE id=?", [req.params.id]);
    res.json({ message: "Resim silindi" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
