const fs = require("node:fs/promises");
const path = require("node:path");

const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const FILE_STORE_PATH = IS_VERCEL_RUNTIME
  ? path.join("/tmp", "artia-ids.json")
  : path.join(process.cwd(), ".cache", "artia-ids.json");
const BUNDLED_SNAPSHOT_PATH = path.join(process.cwd(), "data", "artia-ids.json");

function readEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function getBlobPathname() {
  return readEnv("ARTIA_SNAPSHOT_BLOB_PATH", "artia/artia-ids.json");
}

function hasBlobStore() {
  return Boolean(readEnv("BLOB_READ_WRITE_TOKEN"));
}

async function getBlobSdk() {
  return require("@vercel/blob");
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readLocalSnapshot() {
  const raw = await fs.readFile(FILE_STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function readBundledSnapshot() {
  const raw = await fs.readFile(BUNDLED_SNAPSHOT_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeLocalSnapshot(payload) {
  await fs.mkdir(path.dirname(FILE_STORE_PATH), { recursive: true });
  await fs.writeFile(FILE_STORE_PATH, JSON.stringify(payload));
}

async function readBlobSnapshot() {
  const { get } = await getBlobSdk();
  const result = await get(getBlobPathname(), { access: "private" });
  if (!result || result.statusCode !== 200) {
    return null;
  }

  const raw = await streamToString(result.stream);
  const payload = JSON.parse(raw);
  if (payload && typeof payload === "object") {
    payload.meta = {
      ...payload.meta,
      blobPathname: getBlobPathname()
    };
  }
  return payload;
}

async function writeBlobSnapshot(payload) {
  const { put } = await getBlobSdk();
  await put(getBlobPathname(), JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8"
  });
}

async function readStoredSnapshot() {
  if (hasBlobStore()) {
    try {
      const payload = await readBlobSnapshot();
      if (payload) return payload;
    } catch (error) {
      if (!String(error?.message || "").toLowerCase().includes("not found")) {
        throw error;
      }
    }
  }

  try {
    return await readLocalSnapshot();
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  return readBundledSnapshot();
}

async function writeStoredSnapshot(payload) {
  if (hasBlobStore()) {
    await writeBlobSnapshot(payload);
  }

  await writeLocalSnapshot(payload);
}

function getStoreSummary() {
  return {
    mode: hasBlobStore() ? "vercel-blob" : "local-file",
    filePath: FILE_STORE_PATH,
    bundledPath: BUNDLED_SNAPSHOT_PATH,
    blobPathname: getBlobPathname()
  };
}

module.exports = {
  readStoredSnapshot,
  writeStoredSnapshot,
  getStoreSummary
};
