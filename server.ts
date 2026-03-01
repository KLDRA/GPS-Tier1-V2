import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("fieldtech.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    clientId TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT,
    notes TEXT,
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/clients", (req, res) => {
    const clients = db.prepare("SELECT * FROM clients").all();
    res.json(clients);
  });

  app.post("/api/clients", (req, res) => {
    const { id, name, address } = req.body;
    db.prepare("INSERT INTO clients (id, name, address) VALUES (?, ?, ?)").run(id, name, address);
    res.status(201).json({ id, name, address });
  });

  app.delete("/api/clients/:id", (req, res) => {
    const { id } = req.params;
    // Note: This might fail if there are activities for this client due to foreign key constraints
    // But better-sqlite3 doesn't enforce them by default unless PRAGMA foreign_keys = ON; is set.
    // In our case, we want to allow it or handle it.
    try {
      db.prepare("DELETE FROM activities WHERE clientId = ?").run(id);
      db.prepare("DELETE FROM clients WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "No se pudo eliminar el cliente" });
    }
  });

  app.get("/api/activities", (req, res) => {
    const activities = db.prepare(`
      SELECT a.*, c.name as clientName 
      FROM activities a 
      JOIN clients c ON a.clientId = c.id 
      ORDER BY a.startTime DESC
    `).all();
    res.json(activities);
  });

  app.post("/api/activities", (req, res) => {
    const { id, type, clientId, startTime, notes } = req.body;
    db.prepare("INSERT INTO activities (id, type, clientId, startTime, notes) VALUES (?, ?, ?, ?, ?)")
      .run(id, type, clientId, startTime, notes);
    res.status(201).json({ id, type, clientId, startTime, notes });
  });

  app.patch("/api/activities/:id", (req, res) => {
    const { id } = req.params;
    const { endTime, notes } = req.body;
    db.prepare("UPDATE activities SET endTime = ?, notes = COALESCE(?, notes) WHERE id = ?")
      .run(endTime, notes, id);
    res.json({ success: true });
  });

  app.delete("/api/activities/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM activities WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
