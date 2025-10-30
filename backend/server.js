import express from "express";
import cors from "cors";
import multer from "multer";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_URL = process.env.PUBLIC_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN || PUBLIC_URL || "*";
const ADMIN_USER = process.env.ADMIN_USER || "kayo";
const ADMIN_PASS = process.env.ADMIN_PASS || "@Mine9273";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "products_sheet";
const SUPABASE_VISITORS_TABLE = process.env.SUPABASE_VISITORS_TABLE || "quem entrou no site";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "frontend", "public");
const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(dataDir, "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, "iwanted.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,              -- fica opcional (pode ignorar)
  price INTEGER NOT NULL,     -- em centavos
  oldPrice INTEGER,
  category TEXT NOT NULL,
  brand TEXT,
  tags TEXT,
  image TEXT,
  images TEXT,
  description TEXT,
  specs TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  isBlackFriday INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

try {
  db.prepare("ALTER TABLE products ADD COLUMN brand TEXT").run();
} catch (err) {
  if (!(err && /duplicate column name/i.test(err.message || ""))) {
    throw err;
  }
}

try {
  db.prepare("ALTER TABLE products ADD COLUMN isActive INTEGER DEFAULT 1").run();
  db.prepare("UPDATE products SET isActive = 1 WHERE isActive IS NULL").run();
} catch (err) {
  if (!(err && /duplicate column name/i.test(err.message || ""))) {
    throw err;
  }
}

try {
  db.prepare("ALTER TABLE products ADD COLUMN isBlackFriday INTEGER DEFAULT 0").run();
  db.prepare("UPDATE products SET isBlackFriday = 0 WHERE isBlackFriday IS NULL").run();
} catch (err) {
  if (!(err && /duplicate column name/i.test(err.message || ""))) {
    throw err;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS featured_products (
  slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 3),
  productId TEXT,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(productId) REFERENCES products(id) ON DELETE SET NULL
);
`);

// Seção "Mais produtos" da página inicial (6 posições)
db.exec(`
CREATE TABLE IF NOT EXISTS home_products (
  slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 6),
  productId TEXT,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(productId) REFERENCES products(id) ON DELETE SET NULL
);
`);

// Produto "mega destaque" da home (1 posição fixa)
db.exec(`
CREATE TABLE IF NOT EXISTS hero_product (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  productId TEXT,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(productId) REFERENCES products(id) ON DELETE SET NULL
);
`);
db.prepare(`INSERT OR IGNORE INTO hero_product (id, productId) VALUES (1, NULL)`).run();

// CORS configurável: restringe à origem definida se houver
if (CORS_ORIGIN && CORS_ORIGIN !== "*") {
  app.use(cors({ origin: CORS_ORIGIN }));
} else {
  app.use(cors());
}
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));
// Protege acesso direto ao arquivo /admin.html (além da rota /admin)
app.use((req, res, next) => {
  if (req.path === "/admin.html") {
    return requireAdmin(req, res, () => res.sendFile(path.join(publicDir, "admin.html")));
  }
  next();
});
app.use(express.static(publicDir));

/* === Auth básico para rotas administrativas === */
function parseBasicAuth(header) {
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (!/^Basic$/i.test(scheme || "") || !token) return null;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}
function requireAdmin(req, res, next) {
  const creds = parseBasicAuth(req.headers["authorization"]);
  if (creds && creds.user === ADMIN_USER && creds.pass === ADMIN_PASS) return next();
  res.set("WWW-Authenticate", "Basic realm=\"Admin Area\"");
  return res.status(401).send("Authentication required");
}

const isAdminRequest = (req) => {
  const creds = parseBasicAuth(req.headers["authorization"]);
  return Boolean(creds && creds.user === ADMIN_USER && creds.pass === ADMIN_PASS);
};

/* === Upload (restrito e com validação) === */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const safeExt = (path.extname(file.originalname || "").toLowerCase() || ".bin").slice(0, 10);
    cb(null, `${Date.now()}-${nanoid(6)}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("invalid_file_type"));
  }
});

const toCents = (n) => Math.round(Number(n) * 100);
const fromCents = (n) => (Number(n) / 100);
const normalizeText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();
const slugify = (value) => normalizeText(value)
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
const safeJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const safeJsonObject = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeFlagInput = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "on", "ativo", "active", "online"].includes(normalized)) return 1;
    if (["0", "false", "off", "inativo", "inactive", "offline", "of"].includes(normalized)) return 0;
    const num = Number(normalized);
    if (Number.isFinite(num)) return num ? 1 : 0;
    return null;
  }
  return null;
};

const isRowActive = (row) => {
  const flag = row?.isActive;
  if (flag === null || flag === undefined) return true;
  return Number(flag) !== 0;
};

async function supabaseEnsureVisitorRecord(phone, name) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return;
    const tableName = SUPABASE_VISITORS_TABLE?.trim();
    if (!tableName) return;

    const base = SUPABASE_URL.replace(/\/$/, "");
    const tablePath = encodeURIComponent(tableName);
    const commonHeaders = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    try {
      const checkUrl = new URL(`${base}/rest/v1/${tablePath}`);
      checkUrl.searchParams.set("select", "numero");
      checkUrl.searchParams.set("numero", `eq.${digits}`);
      checkUrl.searchParams.set("limit", "1");
      const checkRes = await fetch(checkUrl, { headers: commonHeaders });
      if (checkRes.ok) {
        const arr = await checkRes.json().catch(() => null);
        if (Array.isArray(arr) && arr.length) return;
      } else {
        console.warn("[visitors] Supabase check falhou", { status: checkRes.status });
      }
    } catch (err) {
      console.warn("[visitors] Supabase check erro", err?.message || err);
    }

    try {
      const payload = [{ numero: digits, nome: name ? String(name) : null }];
      const insertUrl = `${base}/rest/v1/${tablePath}?on_conflict=numero`;
      const insertHeaders = {
        ...commonHeaders,
        "Prefer": "resolution=merge-duplicates,return=minimal"
      };
      const insertRes = await fetch(insertUrl, {
        method: "POST",
        headers: insertHeaders,
        body: JSON.stringify(payload)
      });
      if (!insertRes.ok) {
        const text = await insertRes.text().catch(() => "");
        console.warn("[visitors] Supabase insert falhou", insertRes.status, text);
      }
    } catch (err) {
      console.warn("[visitors] Supabase insert erro", err?.message || err);
    }
  } catch (err) {
    console.warn("[visitors] Registro erro", err?.message || err);
  }
}

async function supabaseUpsertProduct(p) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const row = {
      id: p.id,
      name: p.name,
      category: p.category || null,
      price: typeof p.price === "number" ? Number(p.price) : null,
      oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
      image: p.image || null,
      createdAt: p.createdAt || null
    };
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?on_conflict=id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([row])
    });
    if (!res.ok) {
      const text = await res.text().catch(()=>"");
      console.warn("Supabase upsert falhou:", res.status, text);
    }
  } catch (e) {
    console.warn("Supabase upsert erro:", e?.message || e);
  }
}

async function supabaseDeleteProduct(id) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(()=>"");
      console.warn("Supabase delete falhou:", res.status, text);
    }
  } catch (e) {
    console.warn("Supabase delete erro:", e?.message || e);
  }
}

/* LISTAR */
app.get("/api/products", (req, res) => {
  const q = normalizeText(req.query.q || "");
  const cat = slugify(req.query.category || "");
  const admin = isAdminRequest(req);
  const includeInactiveParam = String(req.query.includeInactive ?? req.query.includeOffline ?? "").trim().toLowerCase();
  const includeInactive = admin && (includeInactiveParam === "1" || includeInactiveParam === "true");
  const rawBlackParam = req.query.black ?? req.query.blackFriday ?? req.query.isBlack ?? req.query.isBlackFriday;
  const blackFilterFlag = normalizeFlagInput(rawBlackParam);
  const sql = includeInactive
    ? "SELECT * FROM products ORDER BY createdAt DESC"
    : "SELECT * FROM products WHERE COALESCE(isActive, 1) = 1 ORDER BY createdAt DESC";
  const rows = db.prepare(sql).all();

  let list = rows.map(normalizeProductRow);

  if (q) {
    const matches = (value) => normalizeText(value).includes(q);
    list = list.filter(p =>
      matches(p.name) ||
      matches(p.subtitle) ||
      matches(p.tags) ||
      matches(p.category)
    );
  }
  if (cat) list = list.filter(p => slugify(p.category) === cat);
  if (blackFilterFlag !== null) {
    list = list.filter(p => (p.isBlackFriday ? 1 : 0) === (blackFilterFlag ? 1 : 0));
  }

  res.json(list);
});

const normalizeProductRow = (row) => ({
  ...row,
  price: fromCents(row.price),
  oldPrice: row.oldPrice ? fromCents(row.oldPrice) : null,
  images: safeJsonArray(row.images),
  specs: safeJsonObject(row.specs),
  isActive: isRowActive(row),
  isBlackFriday: Number(row.isBlackFriday) === 1
});

app.get("/api/featured", (_req, res) => {
  const rows = db.prepare(`
    SELECT f.slot, f.productId, p.name, p.price, p.oldPrice
    FROM featured_products f
    LEFT JOIN products p ON p.id = f.productId AND COALESCE(p.isActive, 1) = 1
    ORDER BY f.slot
  `).all();

  const slots = [1, 2, 3].map(slot => ({ slot, productId: null }));
  for (const row of rows) {
    const index = slots.findIndex(s => s.slot === row.slot);
    if (index >= 0) {
      slots[index] = {
        slot: row.slot,
        productId: row.productId || null,
        product: row.productId && row.name ? {
          id: row.productId,
          name: row.name,
          price: fromCents(row.price),
          oldPrice: row.oldPrice ? fromCents(row.oldPrice) : null
        } : null
      };
    }
  }

  res.json(slots);
});

app.get("/api/featured-products", (_req, res) => {
  const rows = db.prepare(`
    SELECT p.*
    FROM featured_products f
    JOIN products p ON p.id = f.productId AND COALESCE(p.isActive, 1) = 1
    ORDER BY f.slot
  `).all();

  const list = rows.map(normalizeProductRow);
  res.json(list);
});

// Slots simples com metadados para a home (até 6 produtos)
app.get("/api/home", (_req, res) => {
  const rows = db.prepare(`
    SELECT h.slot, h.productId, p.name, p.price, p.oldPrice
    FROM home_products h
    LEFT JOIN products p ON p.id = h.productId AND COALESCE(p.isActive, 1) = 1
    ORDER BY h.slot
  `).all();

  const slots = [1,2,3,4,5,6].map(slot=>({ slot, productId: null }));
  for (const row of rows) {
    const idx = slots.findIndex(s=>s.slot===row.slot);
    if (idx>=0) {
      slots[idx] = {
        slot: row.slot,
        productId: row.productId || null,
        product: row.productId && row.name ? {
          id: row.productId,
          name: row.name,
          price: fromCents(row.price),
          oldPrice: row.oldPrice ? fromCents(row.oldPrice) : null
        } : null
      };
    }
  }
  res.json(slots);
});

app.get("/api/home-products", (_req, res) => {
  const rows = db.prepare(`
    SELECT p.*
    FROM home_products h
    JOIN products p ON p.id = h.productId AND COALESCE(p.isActive, 1) = 1
    ORDER BY h.slot
  `).all();
  const list = rows.map(normalizeProductRow);
  res.json(list);
});

app.get("/api/hero", (_req, res) => {
  const row = db.prepare(`
    SELECT h.productId, p.*
    FROM hero_product h
    LEFT JOIN products p ON p.id = h.productId AND COALESCE(p.isActive, 1) = 1
    WHERE h.id = 1
  `).get();

  if (!row) {
    return res.json({ productId: null, product: null });
  }

  const product = row.productId && row.name ? normalizeProductRow(row) : null;
  res.json({ productId: row.productId || null, product });
});

app.get("/api/hero-product", (_req, res) => {
  const row = db.prepare(`
    SELECT p.*
    FROM hero_product h
    JOIN products p ON p.id = h.productId AND COALESCE(p.isActive, 1) = 1
    WHERE h.id = 1 AND h.productId IS NOT NULL
  `).get();

  if (!row) return res.json(null);

  res.json(normalizeProductRow(row));
});

// Consulta Supabase view "vw_cashback" por telefone (apenas servidor)
app.get("/api/cashback", async (req, res) => {
  try{
    const raw = String(req.query.phone || "");
    const phone = raw.replace(/\D/g, "");
    if(!phone) return res.status(400).json({ error: "missing_phone" });
    if(!SUPABASE_URL || !SUPABASE_KEY){
      console.warn("[cashback] SUPABASE_URL ou SUPABASE_KEY ausentes");
      return res.status(200).json({ found:false });
    }

    const base = SUPABASE_URL.replace(/\/$/, '');
    const headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    const VIEW = process.env.SUPABASE_CASHBACK_VIEW || 'vw_cashback';
    const phoneCols = ["numero","telefone","phone","celular","fone","whatsapp"];
    const nameCols = ["nome","name","cliente"];
    const cashCols = ["cashback","saldo","valor","balance"];

    const variants = new Set([phone]);
    if(phone.length === 11 && !phone.startsWith('55')) variants.add('55'+phone);
    if(phone.length === 13 && phone.startsWith('55')) variants.add(phone.slice(2));
    variants.add(phone.slice(-11));

    const mapRow = (row) => {
      const nome = nameCols.map(k=>row?.[k]).find(v=>v!=null) ?? null;
      const cbRaw = cashCols.map(k=>row?.[k]).find(v=>v!=null);
      const cashback = cbRaw!=null ? Number(cbRaw) : null;
      return { name: nome, cashback: Number.isFinite(cashback) ? cashback : null };
    };

    console.info("[cashback] consultando Supabase", { variants: Array.from(variants) });

    const getDigits = (v)=>String(v||'').replace(/\D/g,'');

    // 1) Tentativas por igualdade exata (com variações comuns)
    for(const col of phoneCols){
      for(const v of variants){
        try{
          const url = `${base}/rest/v1/${encodeURIComponent(VIEW)}?select=*\u0026${encodeURIComponent(col)}=eq.${encodeURIComponent(v)}`;
          const r = await fetch(url, { headers });
          if(!r.ok){
            console.warn("[cashback] Supabase eq request falhou", { col, variant: v, status: r.status });
            continue;
          }
          const arr = await r.json();
          if(Array.isArray(arr) && arr.length){
            const row = arr[0] || {};
            const { name, cashback } = mapRow(row);
            supabaseEnsureVisitorRecord(phone, name).catch(()=>{});
            return res.json({ found:true, name, cashback });
          }
        }catch(err){
          console.warn("[cashback] Supabase eq erro", { col, variant: v, message: err?.message || err });
        }
      }
    }

    // 2) Busca ampla (ilike) pelos últimos 11 dígitos, depois valida no servidor
    const last11 = phone.slice(-11);
    if(last11){
      try{
        const u = new URL(`${base}/rest/v1/${encodeURIComponent(VIEW)}`);
        u.searchParams.set('select','*');
        u.searchParams.set('limit','50');
        const ors = phoneCols.map(c=>`${c}.ilike.*${last11}*`).join(',');
        u.searchParams.set('or',`(${ors})`);
        const r = await fetch(u.toString(), { headers });
        if(!r.ok){
          console.warn("[cashback] Supabase ilike request falhou", { status: r.status });
        }else{
          const arr = await r.json();
          if(Array.isArray(arr) && arr.length){
            const match = arr.find(row => {
              const candidates = phoneCols.map(c=>getDigits(row?.[c])).filter(Boolean);
              return candidates.some(d => variants.has(d) || d.endsWith(last11));
            });
            if(match){
              const { name, cashback } = mapRow(match);
              supabaseEnsureVisitorRecord(phone, name).catch(()=>{});
              return res.json({ found:true, name, cashback });
            }
          }
        }
      }catch(err){
        console.warn("[cashback] Supabase ilike erro", err?.message || err);
      }
    }

    return res.json({ found:false });
  }catch(e){
    console.error("[cashback] server_error", e?.message || e);
    return res.status(500).json({ error: "server_error" });
  }
});

app.put("/api/home", requireAdmin, (req, res) => {
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const slots = [1,2,3,4,5,6];

  const normalized = slots.map((slot, index) => {
    const val = rawIds[index];
    if (typeof val === "string" && val.trim()) {
      return { slot, productId: val.trim() };
    }
    return { slot, productId: null };
  });

  const ids = normalized.map(i=>i.productId).filter(Boolean);
  const duplicates = ids.filter((id, idx)=>ids.indexOf(id)!==idx);
  if (duplicates.length) return res.status(400).json({ error: "duplicate_products" });

  for (const item of normalized) {
    if (!item.productId) continue;
    const exists = db.prepare("SELECT isActive FROM products WHERE id = ?").get(item.productId);
    if (!exists || !isRowActive(exists)) return res.status(400).json({ error: "invalid_product", slot: item.slot });
  }

  const stmt = db.prepare(`
    INSERT INTO home_products (slot, productId, updatedAt)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(slot) DO UPDATE SET productId = excluded.productId, updatedAt = CURRENT_TIMESTAMP
  `);
  const tx = db.transaction((items)=>{ for (const it of items) stmt.run(it.slot, it.productId); });
  tx(normalized);
  res.json({ ok: true, slots: normalized });
});

app.put("/api/featured", requireAdmin, (req, res) => {
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const slots = [1, 2, 3];

  const normalized = slots.map((slot, index) => {
    const val = rawIds[index];
    if (typeof val === "string" && val.trim()) {
      return { slot, productId: val.trim() };
    }
    return { slot, productId: null };
  });

  const ids = normalized.map(item => item.productId).filter(Boolean);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) {
    return res.status(400).json({ error: "duplicate_products" });
  }

  for (const item of normalized) {
    if (!item.productId) continue;
    const exists = db.prepare("SELECT isActive FROM products WHERE id = ?").get(item.productId);
    if (!exists || !isRowActive(exists)) {
      return res.status(400).json({ error: "invalid_product", slot: item.slot });
    }
  }

  const stmt = db.prepare(`
    INSERT INTO featured_products (slot, productId, updatedAt)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(slot) DO UPDATE SET productId = excluded.productId, updatedAt = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.slot, item.productId);
    }
  });

  tx(normalized);

  res.json({ ok: true, slots: normalized });
});

app.put("/api/hero", requireAdmin, (req, res) => {
  const rawId = typeof req.body?.productId === "string" ? req.body.productId.trim() : "";
  if (rawId) {
    const exists = db.prepare("SELECT isActive FROM products WHERE id = ?").get(rawId);
    if (!exists || !isRowActive(exists)) return res.status(400).json({ error: "invalid_product" });
  }

  db.prepare(`
    INSERT INTO hero_product (id, productId, updatedAt)
    VALUES (1, NULLIF(?, ''), CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET productId = excluded.productId, updatedAt = CURRENT_TIMESTAMP
  `).run(rawId);

  const row = db.prepare(`
    SELECT h.productId, p.*
    FROM hero_product h
    LEFT JOIN products p ON p.id = h.productId AND COALESCE(p.isActive, 1) = 1
    WHERE h.id = 1
  `).get();

  const product = row?.productId && row?.name ? normalizeProductRow(row) : null;
  res.json({ ok: true, productId: row?.productId || null, product });
});

/* LER */
app.get("/api/products/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  const admin = isAdminRequest(req);
  if (!row || (!admin && !isRowActive(row))) return res.status(404).json({ error: "not_found" });
  const product = normalizeProductRow(row);
  res.json(product);
});

/* CRIAR — sem auth */
app.post("/api/products", requireAdmin, (req, res) => {
  const id = req.body.id || nanoid(10);
  const {
    name, /* subtitle ignorável */ subtitle,
    price, oldPrice, category, brand, tags, image, images = [], description, specs = {}
  } = req.body;

  const brandValue = typeof brand === "string" ? brand.trim() : "";
  const isActiveFlag = normalizeFlagInput(req.body?.isActive);
  const isActive = isActiveFlag == null ? 1 : isActiveFlag;
  const isBlackFridayFlag = normalizeFlagInput(
    req.body?.isBlackFriday ?? req.body?.blackFriday ?? req.body?.isBlack
  );
  const isBlackFriday = isBlackFridayFlag == null ? 0 : isBlackFridayFlag;

  if (!name || !category || !brandValue || price == null) return res.status(400).json({ error: "missing_fields" });

  db.prepare(`
    INSERT INTO products (id, name, subtitle, price, oldPrice, category, brand, tags, image, images, description, specs, isActive, isBlackFriday)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, subtitle || null, toCents(price), oldPrice ? toCents(oldPrice) : null,
    category, brandValue || null, (Array.isArray(tags) ? tags.join(",") : (tags || null)),
    image || null, JSON.stringify(images || []), description || null, JSON.stringify(specs || {}), isActive, isBlackFriday
  );
  // Envia para Supabase de forma assíncrona (não bloqueia a resposta)
  supabaseUpsertProduct({
    id,
    name,
    price: Number(price),
    oldPrice: oldPrice != null ? Number(oldPrice) : null,
    category,
    image: image || null,
    createdAt: new Date().toISOString()
  });
  res.status(201).json({ id });
});

/* ATUALIZAR — sem auth */
app.put("/api/products/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  const cur = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!cur) return res.status(404).json({ error: "not_found" });

  const { name, subtitle, price, oldPrice, category, brand, tags, image, images, description, specs } = req.body;
  const brandValue = typeof brand === "string" ? brand.trim() : null;
  const hasIsActive = Object.prototype.hasOwnProperty.call(req.body, "isActive");
  const isActiveFlag = hasIsActive ? normalizeFlagInput(req.body.isActive) : null;
  const rawBlackInput = Object.prototype.hasOwnProperty.call(req.body, "isBlackFriday")
    ? req.body.isBlackFriday
    : (Object.prototype.hasOwnProperty.call(req.body, "blackFriday")
      ? req.body.blackFriday
      : (Object.prototype.hasOwnProperty.call(req.body, "isBlack") ? req.body.isBlack : undefined));
  const hasBlackFriday = rawBlackInput !== undefined;
  const blackFridayFlag = hasBlackFriday ? normalizeFlagInput(rawBlackInput) : null;

  // Atualização dinâmica: preserva oldPrice quando ausente; permite limpar quando null
  const sets = [
    "name = COALESCE(?, name)",
    "subtitle = COALESCE(?, subtitle)",
    "price = COALESCE(?, price)",
    // oldPrice inserido dinamicamente a seguir
    "category = COALESCE(?, category)",
    "brand = COALESCE(?, brand)",
    "tags = COALESCE(?, tags)",
    "image = COALESCE(?, image)",
    "images = COALESCE(?, images)",
    "description = COALESCE(?, description)",
    "specs = COALESCE(?, specs)"
  ];
  const params = [
    name ?? null,
    subtitle ?? null,
    typeof price === "number" ? toCents(price) : null,
  ];
  const hasOldPrice = Object.prototype.hasOwnProperty.call(req.body, "oldPrice");
  if (hasOldPrice) {
    sets.splice(3, 0, "oldPrice = ?");
    params.push(oldPrice == null ? null : toCents(oldPrice));
  }
  params.push(
    category ?? null,
    brandValue ?? null,
    tags ? (Array.isArray(tags) ? tags.join(",") : tags) : null,
    image ?? null,
    images ? JSON.stringify(images) : null,
    description ?? null,
    specs ? JSON.stringify(specs) : null
  );
  if (hasIsActive) {
    sets.push("isActive = COALESCE(?, isActive)");
    params.push(isActiveFlag == null ? null : isActiveFlag);
  }
  if (hasBlackFriday) {
    sets.push("isBlackFriday = COALESCE(?, isBlackFriday)");
    params.push(blackFridayFlag == null ? null : blackFridayFlag);
  }
  const sql = `UPDATE products SET ${sets.join(",\n      ")} WHERE id = ?`;
  db.prepare(sql).run(...params, id);
  try {
    const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (row) {
      supabaseUpsertProduct({
        id: row.id,
        name: row.name,
        price: fromCents(row.price),
        oldPrice: row.oldPrice ? fromCents(row.oldPrice) : null,
        category: row.category,
        image: row.image,
        createdAt: row.createdAt
      });
    }
  } catch {}
  res.json({ ok: true });
});

/* EXCLUIR — sem auth */
app.delete("/api/products/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  supabaseDeleteProduct(req.params.id);
  res.json({ ok: true });
});

/* UPLOAD — sem auth */
app.post("/api/upload", requireAdmin, upload.single("file"), (req, res) => {
  res.json({ url: `/uploads/${req.file.filename}` });
});

const sendStaticPage = (file) => (_req, res) => res.sendFile(path.join(publicDir, file));

app.get(["/catalogo", "/catalogo/"], sendStaticPage("catalog.html"));
app.get(["/black-friday", "/black-friday/"], sendStaticPage("black-friday.html"));
app.get(["/admin", "/admin/"], requireAdmin, sendStaticPage("admin.html"));
app.get(["/produto", "/produto/"], sendStaticPage("produto.html"));
app.get("/produto/:id", sendStaticPage("produto.html"));

app.listen(PORT, HOST, () => {
  const hostLabel = HOST === "0.0.0.0" ? "localhost" : HOST;
  const inferredUrl = `http://${hostLabel}:${PORT}`;
  console.log(`iWanted rodando em ${PUBLIC_URL || inferredUrl}`);
  if (!PUBLIC_URL) {
    console.log("Defina PUBLIC_URL para refletir o domínio público exibido no log.");
  }
});

