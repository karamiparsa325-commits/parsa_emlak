/* Centralized input validation. Each schema returns parsed, coerced, type-narrowed
 * data — unknown keys are dropped, ranges enforced, and javascript: / file: URLs
 * blocked on image fields.
 *
 * Use as: router.post("/x", validate(SomeSchema), handler)
 */
const { z } = require("zod");

// --- Building blocks ------------------------------------------------------

// Accept an image reference that is one of:
//   - /uploads/<file>       (uploaded via /api/upload, sharp-processed)
//   - https://...           (paste-from-URL flow)
//   - data:image/<type>;base64,<data>   (legacy stored entries)
// Anything else — javascript:, file:, http:// — is rejected.
const safeImageUrl = z.string()
  .max(500_000, "Resim adresi çok uzun")
  .refine((s) => {
    if (s.startsWith("/uploads/")) return /^\/uploads\/[\w.\-]+$/.test(s);
    if (s.startsWith("https://")) {
      try { new URL(s); return true; } catch { return false; }
    }
    if (s.startsWith("data:image/")) {
      return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(s);
    }
    return false;
  }, "Geçersiz resim adresi");

const PROPERTY_TYPES = ["Daire", "Villa", "Arsa", "Ofis"];
const STATUSES = ["satilik", "kiralik"];

// Treat "" the same as omitted/null for optional text fields.
const optionalText = (max) => z
  .union([z.string().trim().max(max), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const optionalInt = (min, max) => z
  .union([z.number().int().min(min).max(max), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v));

// --- Schemas --------------------------------------------------------------

const RegisterSchema = z.object({
  username: z.string("Kullanıcı adı gerekli")
    .min(3, "Kullanıcı adı 3-30 karakter olmalı")
    .max(30, "Kullanıcı adı 3-30 karakter olmalı")
    .regex(/^[a-zA-Z0-9_]+$/, "Kullanıcı adı sadece harf, rakam ve _ içerebilir"),
  password: z.string("Şifre gerekli")
    .min(6, "Şifre en az 6 karakter olmalı")
    .max(128, "Şifre çok uzun"),
}).strict();

const LoginSchema = z.object({
  username: z.string("Kullanıcı adı gerekli").min(1, "Kullanıcı adı gerekli").max(50),
  password: z.string("Şifre gerekli").min(1, "Şifre gerekli").max(128),
}).strict();

const PropertySchema = z.object({
  title: z.string("Başlık gerekli").trim().min(1, "Başlık gerekli").max(200, "Başlık 200 karakteri geçemez"),
  location: z.string("Konum gerekli").trim().min(1, "Konum gerekli").max(200, "Konum 200 karakteri geçemez"),
  price: z.number("Geçerli bir fiyat girin")
    .positive("Fiyat 0'dan büyük olmalı")
    .max(10_000_000_000, "Fiyat çok büyük"),
  type: z.enum(PROPERTY_TYPES, "Geçersiz emlak tipi"),
  status: z.enum(STATUSES).optional().default("satilik"),
  image: z.union([safeImageUrl, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  bedrooms: optionalInt(0, 50),
  bathrooms: optionalInt(0, 50),
  area_m2: optionalInt(0, 1_000_000),
  floor_no: optionalText(20),
  year_built: optionalInt(1800, 2100),
  description: optionalText(5000),
}).strict();

const InquirySchema = z.object({
  name: z.string("Ad gerekli").trim().min(1, "Ad gerekli").max(100, "Ad çok uzun"),
  phone: z.string("Telefon gerekli").trim().min(3, "Telefon gerekli").max(30, "Telefon çok uzun"),
  email: z.union([z.string().trim().email("Geçersiz email").max(100), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  message: optionalText(2000),
}).strict();

// --- Middleware -----------------------------------------------------------

function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      // Frontends look at `message`; debugging clients can read `issues`.
      return res.status(400).json({
        message: issues[0]?.message || "Geçersiz veri",
        issues,
      });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = {
  validate,
  RegisterSchema,
  LoginSchema,
  PropertySchema,
  InquirySchema,
  PROPERTY_TYPES,
  STATUSES,
};
