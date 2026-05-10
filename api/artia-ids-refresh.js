const { buildSnapshot } = require("../lib/artia-snapshot-sources");
const { writeStoredSnapshot, getStoreSummary } = require("../lib/artia-snapshot-store");

function readEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOriginValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "*") return "*";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function getOriginDecision(req) {
  const allowedOrigins = splitCsv(readEnv("ARTIA_ALLOWED_ORIGINS")).map(normalizeOriginValue);
  const origin = normalizeOriginValue(req.headers.origin || "");

  if (!allowedOrigins.length) {
    return { allowed: true, corsOrigin: origin || "*" };
  }

  if (!origin) {
    return { allowed: true, corsOrigin: "" };
  }

  if (allowedOrigins.includes("*")) {
    return { allowed: true, corsOrigin: origin };
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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Artia-Refresh-Secret");
  res.setHeader("Vary", "Origin");
  return decision;
}

function isAuthorized(req) {
  const expected = readEnv("ARTIA_REFRESH_SECRET");
  if (!expected) return true;

  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerSecret = String(req.headers["x-artia-refresh-secret"] || "").trim();
  const querySecret = String(req.query?.secret || "").trim();

  return [bearer, headerSecret, querySecret].some((value) => value && value === expected);
}

module.exports = async function handler(req, res) {
  const cors = applyCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido. Use GET ou POST." });
  }

  if (!cors.allowed) {
    return res.status(403).json({ error: "Origem nao permitida para este endpoint." });
  }

  if (req.method !== "POST" && !isAuthorized(req)) {
    return res.status(401).json({ error: "Refresh nao autorizado." });
  }

  try {
    const source = String(req.query?.source || "").trim().toLowerCase() || undefined;
    const startedAt = Date.now();
    const payload = await buildSnapshot(source);
    await writeStoredSnapshot(payload);

    return res.status(200).json({
      ok: true,
      meta: {
        ...payload.meta,
        refreshedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        storeMode: getStoreSummary().mode,
        sourceUsed: source || readEnv("ARTIA_IDS_SOURCE_MODE", "bundled")
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Falha ao atualizar o snapshot do Artia."
    });
  }
};
