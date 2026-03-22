const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const rootDir = path.resolve(__dirname, "..");
const inputPath = path.join(rootDir, "base_dados_id_artia_no_client.xlsx");
const outputDir = path.join(rootDir, "data");
const outputPath = path.join(outputDir, "artia-ids.json");

function normKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\u00A0/g, " ");
}

function extractProject(value) {
  const match = String(value ?? "").trim().match(/\b(\d{3,})\b/);
  return match ? match[1] : "";
}

function extractProjectLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\d+\s*[-–—:.]?\s*/, "")
    .replace(/^[-–—:.\s]+/, "")
    .trim();
}

function isWeakProjectLabel(value) {
  const normalized = String(value ?? "").trim();
  return !normalized || /^\d+(?:[.-]\d+)*$/.test(normalized);
}

function isLikelyProjectNameActivity(activity, project, projectLabel) {
  const normalizedActivity = normKey(activity);
  if (!normalizedActivity) return true;
  if (/^\d+$/.test(normalizedActivity)) return true;
  if (normalizedActivity === normKey(project)) return true;
  if (projectLabel && normalizedActivity === normKey(projectLabel)) return true;
  return false;
}

function buildRows(sheet) {
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: ["A", "B", "C"],
    range: 0,
    blankrows: false,
    defval: ""
  });

  const dedup = new Set();
  const rows = [];

  for (const row of rawRows) {
    const activity = String(row.A ?? "").trim();
    const id = String(row.B ?? "").trim();
    const sourceProject = String(row.C ?? "").trim();
    if (!activity || !id || !sourceProject) continue;

    const project = extractProject(sourceProject);
    const extractedLabel = extractProjectLabel(sourceProject);
    const projectLabel = isWeakProjectLabel(extractedLabel) ? project : extractedLabel;
    if (!project) continue;
    if (isLikelyProjectNameActivity(activity, project, projectLabel)) continue;

    const key = `${normKey(project)}||${normKey(activity)}||${normKey(id)}`;
    if (dedup.has(key)) continue;
    dedup.add(key);

    rows.push({
      project,
      projectLabel,
      activity,
      id
    });
  }

  rows.sort((a, b) =>
    a.project.localeCompare(b.project, "pt-BR", { numeric: true }) ||
    a.activity.localeCompare(b.activity, "pt-BR", { sensitivity: "base" })
  );

  return rows;
}

function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Arquivo não encontrado: ${inputPath}`);
  }

  const workbook = XLSX.readFile(inputPath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Nenhuma aba encontrada no XLSX.");
  }

  const rows = buildRows(workbook.Sheets[firstSheetName]);
  const payload = {
    rows,
    meta: {
      count: rows.length,
      builtAt: new Date().toISOString(),
      sourceName: path.basename(inputPath),
      sourceType: "xlsx-snapshot"
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload));
  console.log(`Snapshot gerado em ${outputPath} com ${rows.length} registros.`);
}

main();
