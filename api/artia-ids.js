const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");

let poolPromise = null;
let snapshotCache = null;

function readEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getOriginDecision(req) {
  const allowedOrigins = splitCsv(readEnv("ARTIA_ALLOWED_ORIGINS"));
  const origin = String(req.headers.origin || "").trim();

  if (!allowedOrigins.length) {
    return { allowed: true, corsOrigin: origin || "*" };
  }

  if (!origin) {
    return { allowed: false, corsOrigin: "" };
  }

  if (!allowedOrigins.includes(origin)) {
    return { allowed: false, corsOrigin: "" };
  }

  return { allowed: true, corsOrigin: origin };
}

function applyCors(req, res) {
  const decision = getOriginDecision(req);
  if (decision.corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", decision.corsOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  return decision;
}

function parseLimit(value) {
  const limit = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.min(limit, 5000);
}

function limitRows(rows, limit) {
  return limit ? rows.slice(0, limit) : rows;
}

function getSnapshotPath() {
  return path.join(process.cwd(), "data", "artia-ids.json");
}

async function readSnapshot() {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.loadedAt < 60_000) {
    return snapshotCache.payload;
  }

  const raw = await fs.readFile(getSnapshotPath(), "utf8");
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload?.rows)) {
    throw new Error("Snapshot inválido: rows ausente.");
  }

  snapshotCache = {
    loadedAt: now,
    payload
  };
  return payload;
}

function requireDbConfig() {
  const config = {
    host: readEnv("ARTIA_DB_HOST"),
    port: Number(readEnv("ARTIA_DB_PORT", "3306")),
    user: readEnv("ARTIA_DB_USER"),
    password: readEnv("ARTIA_DB_PASSWORD"),
    database: readEnv("ARTIA_DB_NAME")
  };

  const missing = Object.entries({
    ARTIA_DB_HOST: config.host,
    ARTIA_DB_PORT: config.port,
    ARTIA_DB_USER: config.user,
    ARTIA_DB_PASSWORD: config.password,
    ARTIA_DB_NAME: config.database
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Defina ${missing.join(", ")} na Vercel.`);
  }

  return config;
}

async function getPool() {
  if (!poolPromise) {
    const config = requireDbConfig();
    poolPromise = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 0,
      connectTimeout: Number(readEnv("ARTIA_DB_CONNECT_TIMEOUT_MS", "10000")),
      ssl: readEnv("ARTIA_DB_SSL", "true") === "false" ? undefined : { rejectUnauthorized: false }
    });
  }
  return poolPromise;
}

function normalizeDbRow(row) {
  const project = String(row.project ?? "").trim();
  const projectLabel = String(row.projectLabel ?? "").trim();
  const activity = String(row.activity ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!project || !projectLabel || !activity || !id) return null;
  return { project, projectLabel, activity, id };
}

async function loadRowsFromDbQuery(limit) {
  const sql = readEnv("ARTIA_DB_QUERY");
  if (!sql) {
    throw new Error("Modo DB ativado, mas ARTIA_DB_QUERY não foi definido.");
  }

  const pool = await getPool();
  const [rows] = await pool.query({
    sql,
    timeout: Number(readEnv("ARTIA_DB_QUERY_TIMEOUT_MS", "15000"))
  });

  return limitRows(rows.map(normalizeDbRow).filter(Boolean), limit);
}

async function loadRows({ limit }) {
  const mode = readEnv("ARTIA_IDS_SOURCE_MODE", "snapshot").toLowerCase();

  if (mode === "db") {
    return {
      rows: await loadRowsFromDbQuery(limit),
      meta: {
        count: null,
        fetchedAt: new Date().toISOString(),
        sourceName: "Artia DB query",
        sourceType: "mysql"
      }
    };
  }

  const snapshot = await readSnapshot();
  return {
    rows: limitRows(snapshot.rows, limit),
    meta: {
      ...snapshot.meta,
      fetchedAt: new Date().toISOString(),
      sourceName: snapshot.meta?.sourceName || "artia-ids.json",
      sourceType: snapshot.meta?.sourceType || "snapshot"
    }
  };
}

module.exports = async function handler(req, res) {
  const cors = applyCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido. Use GET." });
  }

  if (!cors.allowed) {
    return res.status(403).json({ error: "Origem não permitida para esta API." });
  }

  try {
    const limit = parseLimit(req.query?.limit);
    const payload = await loadRows({ limit });

    return res.status(200).json({
      rows: payload.rows,
      meta: {
        ...payload.meta,
        count: payload.rows.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Falha inesperada ao carregar IDs do Artia."
    });
  }
};
