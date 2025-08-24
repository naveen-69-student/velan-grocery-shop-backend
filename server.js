import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import multer from 'multer';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const db = new sqlite3.Database('grocery.sqlite');

// ✅ Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ✅ Allow frontend domain (Netlify)
app.use(cors({
  origin: ['https://velangroceryshop.netlify.app'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Backend base URL (for storing images with full path)
const BACKEND_URL = process.env.BACKEND_URL || 'https://velan-grocery-shop-backend.onrender.com';

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- Create tables ---
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    image TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price INTEGER,
    image TEXT,
    category TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS status (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

// --- Categories ---
app.get('/categories', (req, res) => {
  db.all('SELECT * FROM categories', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/categories', upload.single('image'), (req, res) => {
  const { name } = req.body;
  const image = req.file ? `${BACKEND_URL}/uploads/${req.file.filename}` : null;
  db.run(`INSERT INTO categories (name, image) VALUES (?, ?)`, [name, image], function (err) {
    if (err) return res.json({ success: false, error: err.message });
    res.json({ success: true, id: this.lastID, image });
  });
});

app.delete('/categories/:id', (req, res) => {
  db.run(`DELETE FROM categories WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/categories/by-name/:name', (req, res) => {
  db.run(`DELETE FROM categories WHERE name=?`, [req.params.name], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- Products ---
app.get('/products', (req, res) => {
  const category = req.query.category;
  let sql = 'SELECT * FROM products';
  const params = [];
  if (category) {
    sql += ' WHERE category = ?';
    params.push(category);
  }
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/products', upload.single('image'), (req, res) => {
  const { name, description, price, category } = req.body;
  const image = req.file ? `${BACKEND_URL}/uploads/${req.file.filename}` : null;
  db.run(
    `INSERT INTO products (name, description, price, image, category) VALUES (?, ?, ?, ?, ?)`,
    [name, description, price, image, category],
    function (err) {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, productId: this.lastID, image });
    }
  );
});

app.delete('/products/:id', (req, res) => {
  db.run(`DELETE FROM products WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/products/by-name/:name', (req, res) => {
  db.run(`DELETE FROM products WHERE name=?`, [req.params.name], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- Orders ---
app.get('/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/orders', (req, res) => {
  const { items, details } = req.body;
  db.run(
    `INSERT INTO orders (items, details) VALUES (?, ?)`,
    [JSON.stringify(items), JSON.stringify(details)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, orderId: this.lastID });
    }
  );
});

// --- Leave status ---
app.get('/status/leave', (req, res) => {
  db.get('SELECT value FROM status WHERE key=?', ['leave'], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: row ? row.value : 'none' });
  });
});

app.post('/status/leave', (req, res) => {
  const { status } = req.body;
  db.run(
    `INSERT INTO status (key, value) VALUES ('leave', ?) 
     ON CONFLICT(key) DO UPDATE SET value=?`,
    [status, status],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// --- Health check route ---
app.get('/', (req, res) => {
  res.json({ ok: true, msg: 'Backend running!', time: new Date().toISOString() });
});

// --- Start server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
