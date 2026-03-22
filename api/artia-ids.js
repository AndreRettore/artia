const mysql = require("mysql2/promise");

let poolPromise = null;

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

function extractOrganizationId() {
  const explicit = readEnv("ARTIA_ORGANIZATION_ID");
  if (explicit) return explicit;

  const user = readEnv("ARTIA_DB_USER");
  const match = user.match(/(\d+)/);
  if (match) return match[1];

  throw new Error("Não consegui inferir o organization_id a partir de ARTIA_DB_USER.");
}

function validateTableName(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Nome de tabela inválido: ${name}`);
  }
  return name;
}

function getTableNames() {
  const orgId = extractOrganizationId();

  return {
    projects: validateTableName(
      readEnv("ARTIA_DB_PROJECTS_TABLE", `organization_${orgId}_projects`)
    ),
    activities: validateTableName(
      readEnv("ARTIA_DB_ACTIVITIES_TABLE", `organization_${orgId}_activities`)
    )
  };
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
      connectionLimit: Number(readEnv("ARTIA_DB_CONNECTION_LIMIT", "5")),
      queueLimit: 0,
      connectTimeout: Number(readEnv("ARTIA_DB_CONNECT_TIMEOUT_MS", "10000")),
      ssl: readEnv("ARTIA_DB_SSL", "true") === "false" ? undefined : { rejectUnauthorized: false }
    });
  }

  return poolPromise;
}

function parseLimit(value) {
  const limit = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.min(limit, 5000);
}

function getQueryTimeoutMs() {
  return Number(readEnv("ARTIA_DB_QUERY_TIMEOUT_MS", "15000")) || 15000;
}

async function runQuery(pool, sql) {
  return pool.query({
    sql,
    timeout: getQueryTimeoutMs()
  });
}

function normalizeDbRow(row) {
  const project = String(
    row.project ?? row.project_number ?? row.projectNumber ?? row.project_code ?? ""
  ).trim();
  const projectLabel = String(
    row.projectLabel ?? row.project_label ?? row.project_name ?? row.projectName ?? row.name ?? ""
  ).trim();
  const activity = String(
    row.activity ?? row.activity_title ?? row.activityLabel ?? row.title ?? ""
  ).trim();
  const id = String(
    row.id ?? row.activity_id ?? row.activityId ?? ""
  ).trim();

  if (!project || !activity || !id) {
    return null;
  }

  return {
    project,
    projectLabel,
    activity,
    id
  };
}

async function loadRowsFromDatabase({ limit = null } = {}) {
  const pool = await getPool();
  const customQuery = readEnv("ARTIA_DB_QUERY");

  if (customQuery) {
    const [rows] = await runQuery(pool, customQuery);
    if (!Array.isArray(rows)) {
      throw new Error("A consulta customizada não retornou uma lista.");
    }
    return rows.map(normalizeDbRow).filter(Boolean);
  }

  const tables = getTableNames();
  const [projectRows] = await runQuery(pool, `
    SELECT
      id,
      project_number,
      name,
      status
    FROM ${tables.projects}
  `);
  const projectById = new Map(
    projectRows
      .map((row) => ({
        id: String(row.id ?? "").trim(),
        project: String(row.project_number ?? "").trim() || String(row.id ?? "").trim(),
        projectLabel: String(row.name ?? "").trim(),
        status: Number(row.status ?? 0)
      }))
      .filter((row) => row.id && row.project && row.projectLabel && row.status === 1)
      .map((row) => [row.id, { project: row.project, projectLabel: row.projectLabel }])
  );

  const activitySql = `
    SELECT
      id,
      title,
      folder_last_project_id,
      status
    FROM ${tables.activities}
    WHERE folder_last_project_id IS NOT NULL
    ${limit ? `LIMIT ${limit}` : ""}
  `;
  const [activityRows] = await runQuery(pool, activitySql);

  const rows = [];
  for (const row of activityRows) {
    if (Number(row.status ?? 0) !== 1) continue;
    const projectInfo = projectById.get(String(row.folder_last_project_id));
    if (!projectInfo?.project || !projectInfo?.projectLabel) continue;
    const activity = String(row.title ?? "").trim();
    const id = String(row.id ?? "").trim();
    if (!activity || !id) continue;

    rows.push({
      project: projectInfo.project,
      projectLabel: projectInfo.projectLabel,
      activity,
      id
    });
  }

  return rows.filter((row) => row.project && row.projectLabel && row.activity && row.id);
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
    const rows = await loadRowsFromDatabase({
      limit: parseLimit(req.query?.limit)
    });

    return res.status(200).json({
      rows,
      meta: {
        count: rows.length,
        fetchedAt: new Date().toISOString(),
        sourceName: "Artia DB via Vercel",
        sourceType: "mysql"
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Falha inesperada ao consultar o banco do Artia."
    });
  }
};
