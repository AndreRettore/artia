const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");

function readEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function parseTimeout(value, fallbackMs) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function normalizeRow(row) {
  const project = String(row.project ?? "").trim();
  const projectLabel = String(row.projectLabel ?? "").trim() || project;
  const activity = String(row.activity ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!project || !projectLabel || !activity || !id) return null;
  return { project, projectLabel, activity, id };
}

function sortRows(rows) {
  return rows.sort(
    (a, b) =>
      a.project.localeCompare(b.project, "pt-BR", { numeric: true }) ||
      a.activity.localeCompare(b.activity, "pt-BR", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id, "pt-BR", { numeric: true })
  );
}

function dedupeRows(rows) {
  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    const normalized = normalizeRow(row);
    if (!normalized) continue;
    const key = `${normalized.project}||${normalized.activity}||${normalized.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return sortRows(deduped);
}

function buildPayload(rows, sourceName, sourceType) {
  const normalized = dedupeRows(rows);
  return {
    rows: normalized,
    meta: {
      count: normalized.length,
      builtAt: new Date().toISOString(),
      sourceName,
      sourceType
    }
  };
}

function getBundledSnapshotPath() {
  return path.join(process.cwd(), "data", "artia-ids.json");
}

async function buildSnapshotFromBundled() {
  const raw = await fs.readFile(getBundledSnapshotPath(), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.rows)) {
    throw new Error("Snapshot base invalido em data/artia-ids.json.");
  }

  return buildPayload(parsed.rows, parsed.meta?.sourceName || "bundled snapshot", "bundled");
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
    throw new Error(`Defina ${missing.join(", ")} para usar o source=db.`);
  }

  return config;
}

function inferOrganizationId() {
  const explicit = readEnv("ARTIA_ORGANIZATION_ID");
  if (explicit) return explicit;

  const user = readEnv("ARTIA_DB_USER");
  const match = user.match(/(\d+)/);
  if (!match) {
    throw new Error("Nao consegui inferir ARTIA_ORGANIZATION_ID a partir de ARTIA_DB_USER.");
  }
  return match[1];
}

function getDefaultDbQuery() {
  const orgId = inferOrganizationId();
  const timeEntriesTable = readEnv("ARTIA_DB_TIME_ENTRIES_TABLE", `organization_${orgId}_time_entries`);

  return `
    SELECT DISTINCT
      COALESCE(NULLIF(TRIM(SUBSTRING_INDEX(parent_project, ' - ', 1)), ''), CAST(folder_last_project_id AS CHAR)) AS project,
      TRIM(parent_project) AS projectLabel,
      TRIM(activity_title) AS activity,
      CAST(activity_id AS CHAR) AS id
    FROM ${timeEntriesTable}
    WHERE status = 1
      AND activity_id IS NOT NULL
      AND TRIM(COALESCE(activity_title, '')) <> ''
      AND TRIM(COALESCE(parent_project, '')) <> ''
    ORDER BY project, activity, id
  `;
}

async function buildSnapshotFromDb() {
  const sql = readEnv("ARTIA_DB_QUERY") || getDefaultDbQuery();

  const config = requireDbConfig();
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: parseTimeout(readEnv("ARTIA_DB_CONNECT_TIMEOUT_MS"), 10000),
    ssl: readEnv("ARTIA_DB_SSL", "true") === "false" ? undefined : { rejectUnauthorized: false }
  });

  try {
    const [rows] = await connection.query({
      sql,
      timeout: parseTimeout(readEnv("ARTIA_DB_QUERY_TIMEOUT_MS"), 120000)
    });

    return buildPayload(rows, "Artia DB query", "mysql");
  } finally {
    await connection.end();
  }
}

function getByPath(source, dottedPath) {
  if (!dottedPath) return source;
  return dottedPath.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), source);
}

async function buildSnapshotFromUpstream() {
  const url = readEnv("ARTIA_UPSTREAM_URL");
  if (!url) {
    throw new Error("Defina ARTIA_UPSTREAM_URL para usar o source=upstream.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Tempo limite atingido ao consultar a API do Artia.")),
    parseTimeout(readEnv("ARTIA_UPSTREAM_TIMEOUT_MS"), 30000)
  );

  const headers = {};
  const apiKey = readEnv("ARTIA_API_KEY");
  const authHeader = readEnv("ARTIA_AUTH_HEADER", "Authorization");
  const authScheme = readEnv("ARTIA_AUTH_SCHEME", "Bearer");

  if (apiKey) {
    headers[authHeader] = authScheme ? `${authScheme} ${apiKey}`.trim() : apiKey;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Falha na API upstream do Artia (${response.status}).`);
    }

    const json = await response.json();
    const sourceRows = getByPath(json, readEnv("ARTIA_DATA_PATH"));
    const rows = Array.isArray(sourceRows) ? sourceRows : Array.isArray(json) ? json : null;
    if (!rows) {
      throw new Error("Nao encontrei uma lista valida no JSON retornado pelo Artia.");
    }

    const projectField = readEnv("ARTIA_PROJECT_FIELD", "project");
    const projectLabelField = readEnv("ARTIA_PROJECT_LABEL_FIELD", "projectLabel");
    const activityField = readEnv("ARTIA_ACTIVITY_FIELD", "activity");
    const idField = readEnv("ARTIA_ID_FIELD", "id");

    return buildPayload(
      rows.map((row) => ({
        project: getByPath(row, projectField),
        projectLabel: getByPath(row, projectLabelField),
        activity: getByPath(row, activityField),
        id: getByPath(row, idField)
      })),
      "Artia upstream API",
      "upstream-api"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function resolveSourceMode(explicitSource) {
  const source = String(explicitSource || readEnv("ARTIA_IDS_SOURCE_MODE", "bundled")).trim().toLowerCase();
  return source || "bundled";
}

async function buildSnapshot(sourceMode) {
  const source = resolveSourceMode(sourceMode);

  if (source === "bundled") return buildSnapshotFromBundled();
  if (source === "db") return buildSnapshotFromDb();
  if (source === "upstream") return buildSnapshotFromUpstream();

  throw new Error(`Source invalido: ${source}. Use bundled, db ou upstream.`);
}

module.exports = {
  buildSnapshot,
  buildSnapshotFromBundled,
  buildSnapshotFromDb,
  buildSnapshotFromUpstream,
  dedupeRows
};
