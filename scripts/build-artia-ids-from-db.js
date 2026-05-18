const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "data");
const outputPath = path.join(outputDir, "artia-ids.json");

function readEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requireEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Defina ${name}.`);
  }
  return value;
}

function normalizeRow(row) {
  const project = String(row.project ?? "").trim();
  const projectLabel = String(row.projectLabel ?? "").trim() || project;
  const activity = String(row.activity ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!project || !activity || !id) return null;
  return { project, projectLabel, activity, id };
}

function normalizeKeyPart(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function compareIds(a, b) {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    return Number(left) - Number(right);
  }

  return left.localeCompare(right, "pt-BR", { numeric: true, sensitivity: "base" });
}

function normalizeRows(rows) {
  const byActivity = new Map();
  let validRows = 0;

  for (const row of rows) {
    const normalized = normalizeRow(row);
    if (!normalized) continue;
    validRows += 1;

    const key = `${normalizeKeyPart(normalized.project)}||${normalizeKeyPart(normalized.activity)}`;
    const existing = byActivity.get(key);
    if (!existing || compareIds(normalized.id, existing.row.id) > 0) {
      byActivity.set(key, {
        row: normalized,
        rawCount: (existing?.rawCount || 0) + 1
      });
    } else {
      existing.rawCount += 1;
    }
  }

  const entries = Array.from(byActivity.values());
  return {
    rows: entries
      .map((entry) => entry.row)
      .sort((a, b) =>
        a.project.localeCompare(b.project, "pt-BR", { numeric: true }) ||
        a.activity.localeCompare(b.activity, "pt-BR", { sensitivity: "base" }) ||
        a.id.localeCompare(b.id, "pt-BR", { numeric: true })
      ),
    stats: {
      duplicateActivityGroups: entries.filter((entry) => entry.rawCount > 1).length,
      dedupedRows: Math.max(0, validRows - entries.length)
    }
  };
}

function getOrganizationId() {
  const explicit = readEnv("ARTIA_ORGANIZATION_ID");
  if (explicit) return explicit;

  const user = requireEnv("ARTIA_DB_USER");
  const match = user.match(/(\d+)/);
  if (!match) {
    throw new Error("Não consegui inferir ARTIA_ORGANIZATION_ID a partir de ARTIA_DB_USER.");
  }
  return match[1];
}

function getDefaultQuery() {
  const orgId = getOrganizationId();
  const activitiesTable = readEnv("ARTIA_DB_ACTIVITIES_TABLE", `organization_${orgId}_activities`);
  const projectsTable = readEnv("ARTIA_DB_PROJECTS_TABLE", `organization_${orgId}_projects`);

  return `
    SELECT
      COALESCE(NULLIF(TRIM(p.project_number), ''), CAST(p.id AS CHAR)) AS project,
      COALESCE(NULLIF(TRIM(p.name), ''), COALESCE(NULLIF(TRIM(p.project_number), ''), CAST(p.id AS CHAR))) AS projectLabel,
      a.title AS activity,
      CAST(a.id AS CHAR) AS id
    FROM ${activitiesTable} a
    INNER JOIN ${projectsTable} p ON p.id = a.folder_last_project_id
    WHERE a.status = 1
      AND p.status = 1
      AND TRIM(COALESCE(a.title, '')) <> ''
  `;
}

async function buildSnapshotFromDb() {
  const connection = await mysql.createConnection({
    host: requireEnv("ARTIA_DB_HOST"),
    port: Number(readEnv("ARTIA_DB_PORT", "3306")),
    user: requireEnv("ARTIA_DB_USER"),
    password: requireEnv("ARTIA_DB_PASSWORD"),
    database: requireEnv("ARTIA_DB_NAME"),
    connectTimeout: Number(readEnv("ARTIA_DB_CONNECT_TIMEOUT_MS", "10000")),
    ssl: readEnv("ARTIA_DB_SSL", "true") === "false" ? undefined : { rejectUnauthorized: false }
  });

  try {
    const sql = readEnv("ARTIA_DB_QUERY") || getDefaultQuery();
    const timeout = Number(readEnv("ARTIA_DB_QUERY_TIMEOUT_MS", "900000")) || 900000;
    const [rows] = await connection.query({ sql, timeout });
    const normalized = normalizeRows(rows);

    return {
      rows: normalized.rows,
      meta: {
        count: normalized.rows.length,
        builtAt: new Date().toISOString(),
        sourceName: "Artia DB snapshot",
        sourceType: "mysql-snapshot",
        ...normalized.stats
      }
    };
  } finally {
    await connection.end();
  }
}

async function main() {
  const payload = await buildSnapshotFromDb();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload));
  console.log(`Snapshot gerado em ${outputPath} com ${payload.rows.length} registros.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
