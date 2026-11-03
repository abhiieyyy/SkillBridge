CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('freelancer', 'client')),
  balance REAL NOT NULL DEFAULT 0 CHECK (balance >= 0),
  bio TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gigs (
  id TEXT PRIMARY KEY,
  sellerId TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL CHECK (price > 0),
  days INTEGER NOT NULL DEFAULT 3,
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  gigId TEXT NOT NULL REFERENCES gigs(id),
  title TEXT NOT NULL,
  price REAL NOT NULL,
  buyerId TEXT NOT NULL REFERENCES users(id),
  sellerId TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'delivered', 'completed')),
  reviewed INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL UNIQUE REFERENCES orders(id),
  gigId TEXT NOT NULL REFERENCES gigs(id),
  sellerId TEXT NOT NULL REFERENCES users(id),
  buyerId TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  fromId TEXT NOT NULL REFERENCES users(id),
  toId TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  paymentId TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gigs_category ON gigs(category);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyerId);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(sellerId);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(fromId, toId);