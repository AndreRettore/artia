const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
const apiHandler = require("./api/artia-ids.js");
const refreshHandler = require("./api/artia-ids-refresh.js");
const port = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ico": "image/x-icon"
};

function loadEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { "Content-Type": mime });
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Erro ao ler o arquivo.");
  });
}

function sendNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Arquivo não encontrado.");
}

function resolveStaticFile(urlPath) {
  const requested = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = requested === "/" ? "/index.html" : requested;
  const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, normalized);
  if (!filePath.startsWith(rootDir)) return null;
  if (!fs.existsSync(filePath)) return null;
  if (fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(filePath, "index.html");
    return fs.existsSync(indexPath) ? indexPath : null;
  }
  return filePath;
}

function createApiResponseAdapter(nodeRes) {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      const body = JSON.stringify(payload);
      if (!this.headersSent) {
        nodeRes.writeHead(this.statusCode, {
          "Content-Type": "application/json; charset=utf-8",
          ...this.headers
        });
        this.headersSent = true;
      }
      nodeRes.end(body);
      return this;
    },
    end(body = "") {
      if (!this.headersSent) {
        nodeRes.writeHead(this.statusCode, this.headers);
        this.headersSent = true;
      }
      nodeRes.end(body);
      return this;
    }
  };
}

async function handleApi(nodeReq, nodeRes, parsedUrl) {
  const req = {
    method: nodeReq.method,
    headers: nodeReq.headers,
    query: Object.fromEntries(parsedUrl.searchParams.entries()),
    url: parsedUrl.pathname + parsedUrl.search
  };
  const res = createApiResponseAdapter(nodeRes);
  await apiHandler(req, res);
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

  try {
    if (parsedUrl.pathname === "/api/artia-ids") {
      await handleApi(req, res, parsedUrl);
      return;
    }

    if (parsedUrl.pathname === "/api/artia-ids-refresh") {
      const apiReq = {
        method: req.method,
        headers: req.headers,
        query: Object.fromEntries(parsedUrl.searchParams.entries()),
        url: parsedUrl.pathname + parsedUrl.search
      };
      const apiRes = createApiResponseAdapter(res);
      await refreshHandler(apiReq, apiRes);
      return;
    }

    const filePath = resolveStaticFile(parsedUrl.pathname);
    if (!filePath) {
      sendNotFound(res);
      return;
    }

    sendFile(res, filePath);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error?.message || "Erro interno no servidor local.");
  }
});

server.listen(port, () => {
  console.log(`Servidor local em http://localhost:${port}`);
});
