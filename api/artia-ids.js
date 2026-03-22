const { URL } = require("node:url");

const REQUEST_TIMEOUT_MS = 15000;

function readEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getByPath(source, path) {
  if (!path) return source;
  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), source);
}

function pickArrayFromPayload(payload, dataPath) {
  const candidate = dataPath ? getByPath(payload, dataPath) : payload;
  if (Array.isArray(candidate)) return candidate;
  if (Array.isArray(candidate?.items)) return candidate.items;
  if (Array.isArray(candidate?.data)) return candidate.data;
  return null;
}

function normalizeRow(item, fields) {
  const project = String(getByPath(item, fields.projectField) ?? "").trim();
  const projectLabel = String(getByPath(item, fields.projectLabelField) ?? "").trim();
  const activity = String(getByPath(item, fields.activityField) ?? "").trim();
  const id = String(getByPath(item, fields.idField) ?? "").trim();

  if (!project || !activity || !id) return null;

  return {
    project,
    projectLabel,
    activity,
    id
  };
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

function buildUpstreamUrl(req) {
  const upstreamUrl = readEnv("ARTIA_UPSTREAM_URL");
  if (!upstreamUrl) {
    throw new Error("Defina ARTIA_UPSTREAM_URL na Vercel.");
  }

  const url = new URL(upstreamUrl);
  const forwardQueryParams = splitCsv(readEnv("ARTIA_FORWARD_QUERY_PARAMS"));

  for (const key of forwardQueryParams) {
    const value = req.query?.[key];
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function buildRequestHeaders() {
  const headers = { Accept: "application/json" };
  const apiKey = readEnv("ARTIA_API_KEY");
  const apiKeyHeader = readEnv("ARTIA_API_KEY_HEADER", "Authorization");
  const apiKeyPrefix = readEnv("ARTIA_API_KEY_PREFIX", "Bearer");

  if (apiKey) {
    headers[apiKeyHeader] = apiKeyPrefix ? `${apiKeyPrefix} ${apiKey}` : apiKey;
  }

  const extraHeadersJson = readEnv("ARTIA_EXTRA_HEADERS_JSON");
  if (extraHeadersJson) {
    const extraHeaders = JSON.parse(extraHeadersJson);
    if (extraHeaders && typeof extraHeaders === "object" && !Array.isArray(extraHeaders)) {
      Object.assign(headers, extraHeaders);
    } else {
      throw new Error("ARTIA_EXTRA_HEADERS_JSON precisa ser um objeto JSON.");
    }
  }

  return headers;
}

async function fetchUpstreamJson(url, headers) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    const rawText = await response.text();
    let payload = null;

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }

    return { response, payload, rawText };
  } finally {
    clearTimeout(timeoutId);
  }
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
    const upstreamUrl = buildUpstreamUrl(req);
    const headers = buildRequestHeaders();
    const { response, payload, rawText } = await fetchUpstreamJson(upstreamUrl, headers);

    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.error || payload?.message || rawText || `Falha HTTP ${response.status} ao consultar o Artia.`
      });
    }

    if (!payload) {
      throw new Error("A API de origem não respondeu com JSON.");
    }

    const dataPath = readEnv("ARTIA_DATA_PATH");
    const items = pickArrayFromPayload(payload, dataPath);
    if (!items) {
      throw new Error("Não encontrei uma lista na resposta. Ajuste ARTIA_DATA_PATH.");
    }

    const fields = {
      projectField: readEnv("ARTIA_PROJECT_FIELD", "project"),
      projectLabelField: readEnv("ARTIA_PROJECT_LABEL_FIELD", "projectLabel"),
      activityField: readEnv("ARTIA_ACTIVITY_FIELD", "activity"),
      idField: readEnv("ARTIA_ID_FIELD", "id")
    };

    const rows = items
      .map((item) => normalizeRow(item, fields))
      .filter(Boolean);

    return res.status(200).json({
      rows,
      meta: {
        count: rows.length,
        fetchedAt: new Date().toISOString(),
        sourceName: "Artia API via Vercel",
        sourceEndpoint: `${upstreamUrl.origin}${upstreamUrl.pathname}`
      }
    });
  } catch (error) {
    const isAbortError = error?.name === "AbortError";
    return res.status(isAbortError ? 504 : 500).json({
      error: isAbortError
        ? "Tempo limite excedido ao consultar o Artia."
        : error?.message || "Falha inesperada ao consultar o Artia."
    });
  }
};
