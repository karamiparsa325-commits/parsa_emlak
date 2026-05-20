const express = require("express");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const { authenticateToken, adminOnly } = require("../middleware/auth");
const { validate, PropertySchema, InquirySchema } = require("../validation");

const router = express.Router();

// Rate-limit inquiries: 5 per IP per hour. Inquiries are public + write to DB,
// so without this they are a trivial spam vector.
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: "Çok fazla mesaj gönderdiniz. Bir saat sonra tekrar deneyin." },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET LIST (PUBLIC) — server-side filter / sort / pagination.
// Accepts: page, pageSize, search, status, type, priceMin, priceMax,
// bedMin, areaMin, sort (newest|low|high), ids (comma list for favorites).
// Returns: { items, total, maxPrice, page, pageSize, totalPages }.
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(req.query.pageSize) || 12)));
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      where.push("(title LIKE ? OR location LIKE ? OR type LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (req.query.status === "satilik" || req.query.status === "kiralik") {
      where.push("status = ?");
      params.push(req.query.status);
    }

    const allowedTypes = new Set(["Daire", "Villa", "Arsa", "Ofis"]);
    if (typeof req.query.type === "string" && allowedTypes.has(req.query.type)) {
      where.push("type = ?");
      params.push(req.query.type);
    }

    const num = (v) => (v === undefined || v === "" ? null : Number(v));
    const priceMin = num(req.query.priceMin);
    const priceMax = num(req.query.priceMax);
    const bedMin = num(req.query.bedMin);
    const areaMin = num(req.query.areaMin);
    if (Number.isFinite(priceMin)) { where.push("price >= ?"); params.push(priceMin); }
    if (Number.isFinite(priceMax)) { where.push("price <= ?"); params.push(priceMax); }
    if (Number.isFinite(bedMin))   { where.push("bedrooms >= ?"); params.push(bedMin); }
    if (Number.isFinite(areaMin))  { where.push("area_m2 >= ?"); params.push(areaMin); }

    // ids="" or ids missing → no filter, but ids="" sent explicitly (from the favorites
    // UI when the user has none favorited) is treated as "match nothing".
    if (typeof req.query.ids === "string") {
      const idList = req.query.ids.split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 200); // hard cap to keep SQL sane
      if (idList.length === 0) {
        return res.json({ items: [], total: 0, maxPrice: 0, page, pageSize, totalPages: 0 });
      }
      where.push(`id IN (${idList.map(() => "?").join(",")})`);
      params.push(...idList);
    }

    const orderBy =
      req.query.sort === "low"  ? "price ASC, id DESC" :
      req.query.sort === "high" ? "price DESC, id DESC" :
                                  "id DESC";

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Total + max price in one query (used for stats + pagination).
    const [countRows] = await req.db.query(
      `SELECT COUNT(*) AS total, COALESCE(MAX(price), 0) AS maxPrice FROM properties ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total) || 0;
    const maxPrice = Number(countRows[0].maxPrice) || 0;

    // Page of properties.
    const [properties] = await req.db.query(
      `SELECT * FROM properties ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Hydrate gallery images, restricted to the visible page.
    if (properties.length) {
      const pageIds = properties.map((p) => p.id);
      const [images] = await req.db.query(
        `SELECT id, property_id, image_url
           FROM property_images
          WHERE property_id IN (${pageIds.map(() => "?").join(",")})
          ORDER BY property_id, sort_order`,
        pageIds
      );
      const byProp = new Map();
      for (const img of images) {
        if (!byProp.has(img.property_id)) byProp.set(img.property_id, []);
        byProp.get(img.property_id).push({ id: img.id, url: img.image_url });
      }
      for (const p of properties) p.images = byProp.get(p.id) || [];
    }

    res.json({
      items: properties,
      total,
      maxPrice,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET SINGLE (PUBLIC)
router.get("/:id", async (req, res, next) => {
  try {
    const [properties] = await req.db.execute(
      "SELECT * FROM properties WHERE id = ?",
      [req.params.id]
    );
    if (!properties.length) return res.status(404).json({ message: "İlan bulunamadı" });

    const property = properties[0];
    const [images] = await req.db.execute(
      "SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order",
      [property.id]
    );
    property.images = images.map((img) => ({ id: img.id, url: img.image_url }));

    res.json(property);
  } catch (err) {
    next(err);
  }
});

// ADD (ADMIN)
router.post("/", authenticateToken, adminOnly, validate(PropertySchema), async (req, res, next) => {
  try {
    const { title, location, price, type, image, bedrooms, bathrooms, area_m2, floor_no, year_built, description, status } = req.body;

    await req.db.execute(
      "INSERT INTO properties (title, location, price, type, image, bedrooms, bathrooms, area_m2, floor_no, year_built, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [title, location, price, type, image, bedrooms, bathrooms, area_m2, floor_no, year_built, description, status]
    );

    res.json({ message: "İlan eklendi" });
  } catch (err) {
    next(err);
  }
});

// UPDATE (ADMIN)
router.put("/:id", authenticateToken, adminOnly, validate(PropertySchema), async (req, res, next) => {
  try {
    const propertyId = Number(req.params.id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ message: "Geçersiz ilan" });
    }
    const { title, location, price, type, image, bedrooms, bathrooms, area_m2, floor_no, year_built, description, status } = req.body;

    const [result] = await req.db.execute(
      "UPDATE properties SET title=?, location=?, price=?, type=?, image=?, bedrooms=?, bathrooms=?, area_m2=?, floor_no=?, year_built=?, description=?, status=? WHERE id=?",
      [title, location, price, type, image, bedrooms, bathrooms, area_m2, floor_no, year_built, description, status, propertyId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "İlan bulunamadı" });
    }

    res.json({ message: "İlan güncellendi" });
  } catch (err) {
    next(err);
  }
});

// DELETE (ADMIN) — cascade delete images from DB + disk
router.delete("/:id", authenticateToken, adminOnly, async (req, res, next) => {
  try {
    // Get all images for this property to delete files
    const [images] = await req.db.execute(
      "SELECT image_url FROM property_images WHERE property_id=?",
      [req.params.id]
    );

    // Get main image
    const [props] = await req.db.execute(
      "SELECT image FROM properties WHERE id=?",
      [req.params.id]
    );

    // Delete image files from disk
    const allUrls = images.map((i) => i.image_url);
    if (props.length && props[0].image) allUrls.push(props[0].image);

    for (const url of allUrls) {
      if (url && url.startsWith("/uploads/")) {
        const filePath = path.join(__dirname, "..", "public", url);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
        }
      }
    }

    // Delete from DB (images first due to FK, then property)
    await req.db.execute("DELETE FROM property_images WHERE property_id=?", [req.params.id]);
    await req.db.execute("DELETE FROM properties WHERE id=?", [req.params.id]);

    res.json({ message: "İlan silindi" });
  } catch (err) {
    next(err);
  }
});

// --- INQUIRIES ---

// Submit inquiry (public)
router.post("/:id/inquiry", inquiryLimiter, validate(InquirySchema), async (req, res, next) => {
  try {
    const { name, phone, email, message } = req.body;

    const propertyId = Number(req.params.id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ message: "Geçersiz ilan" });
    }
    const [props] = await req.db.execute(
      "SELECT id FROM properties WHERE id = ?",
      [propertyId]
    );
    if (!props.length) {
      return res.status(404).json({ message: "İlan bulunamadı" });
    }

    await req.db.execute(
      "INSERT INTO inquiries (property_id, name, phone, email, message) VALUES (?, ?, ?, ?, ?)",
      [propertyId, name, phone, email, message]
    );

    res.json({ message: "Mesajınız gönderildi" });
  } catch (err) {
    next(err);
  }
});

// Get inquiries (admin only)
router.get("/:id/inquiries", authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await req.db.execute(
      "SELECT * FROM inquiries WHERE property_id=? ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
