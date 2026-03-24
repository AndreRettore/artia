const { readStoredSnapshot, getStoreSummary } = require("../lib/artia-snapshot-store");

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
    return { allowed: true, corsOrigin: "" };
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

async function readSnapshot() {
  const payload = await readStoredSnapshot();
  if (!Array.isArray(payload?.rows)) {
    throw new Error("Snapshot inválido: rows ausente.");
  }
  return payload;
}

async function loadRows({ limit }) {
  const snapshot = await readSnapshot();
  return {
    rows: limitRows(snapshot.rows, limit),
    meta: {
      ...snapshot.meta,
      fetchedAt: new Date().toISOString(),
      sourceName: snapshot.meta?.sourceName || "artia snapshot",
      sourceType: snapshot.meta?.sourceType || "snapshot",
      storeMode: getStoreSummary().mode
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
