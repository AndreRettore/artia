const { readStoredSnapshot, writeStoredSnapshot, getStoreSummary } = require("../lib/artia-snapshot-store");
const { buildSnapshot } = require("../lib/artia-snapshot-sources");

let refreshPromise = null;

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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function limitRows(rows, limit) {
  return limit ? rows.slice(0, limit) : rows;
}

function toPublicRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    project: String(row?.project ?? "").trim(),
    activity: String(row?.activity ?? "").trim(),
    id: String(row?.id ?? "").trim()
  }));
}

async function readSnapshot() {
  const payload = await readStoredSnapshot();
  if (!Array.isArray(payload?.rows)) {
    throw new Error("Snapshot inválido: rows ausente.");
  }
  return payload;
}

function getSourceMode() {
  return readEnv("ARTIA_IDS_SOURCE_MODE", "bundled").toLowerCase() || "bundled";
}

function getExpectedSourceTypes(mode) {
  if (mode === "db") return ["mysql"];
  if (mode === "upstream") return ["upstream-api"];
  return ["bundled", "xlsx-snapshot"];
}

function shouldRefreshSnapshot(snapshot, mode) {
  if (!snapshot?.rows?.length) return true;
  if (mode === "bundled") return false;

  const ttlMs = parsePositiveInt(readEnv("ARTIA_SNAPSHOT_TTL_MS"), 10 * 60 * 1000);
  const builtAtMs = Date.parse(String(snapshot?.meta?.builtAt || ""));
  const isStale = !Number.isFinite(builtAtMs) || Date.now() - builtAtMs >= ttlMs;
  const sourceType = String(snapshot?.meta?.sourceType || "").trim();
  const sourceMatches = getExpectedSourceTypes(mode).includes(sourceType);

  return isStale || !sourceMatches;
}

async function refreshSnapshot(mode) {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const payload = await buildSnapshot(mode);
      try {
        await writeStoredSnapshot(payload);
      } catch (error) {
        payload.meta = {
          ...payload.meta,
          cacheWriteError: String(error?.message || error || "").trim() || undefined
        };
      }
      return payload;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function loadRows({ limit }) {
  const mode = getSourceMode();
  let snapshot = await readSnapshot();
  let refreshErrorMessage = "";

  if (shouldRefreshSnapshot(snapshot, mode)) {
    try {
      snapshot = await refreshSnapshot(mode);
    } catch (error) {
      refreshErrorMessage = String(error?.message || error || "").trim();
      if (!snapshot?.rows?.length) {
        throw error;
      }
    }
  }

  return {
    rows: limitRows(snapshot.rows, limit),
    meta: {
      ...snapshot.meta,
      fetchedAt: new Date().toISOString(),
      sourceName: snapshot.meta?.sourceName || "artia snapshot",
      sourceType: snapshot.meta?.sourceType || "snapshot",
      storeMode: getStoreSummary().mode,
      sourceMode: mode,
      refreshError: refreshErrorMessage || undefined
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
    const publicRows = toPublicRows(payload.rows);

    return res.status(200).json({
      rows: publicRows,
      meta: {
        ...payload.meta,
        count: publicRows.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Falha inesperada ao carregar IDs do Artia."
    });
  }
};
