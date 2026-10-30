import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditApplication } from "../src/modules/audit/composition";
import { candidateIntakeApplication } from "../src/modules/candidate-intake/composition";
import { handleApi, RequestBodyError, sendJson } from "./api";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(rootDirectory, "dist");
const isDevelopment = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.CONNECTION_FINDER_HOST ?? "0.0.0.0";

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};


async function serveProductionFile(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  let filePath = path.resolve(distDirectory, requested || "index.html");
  if (!filePath.startsWith(`${distDirectory}${path.sep}`) && filePath !== distDirectory) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("NOT_FILE");
  } catch {
    filePath = path.join(distDirectory, "index.html");
  }
  const content = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream",
  });
  response.end(content);
}

let vite: import("vite").ViteDevServer | null = null;
if (isDevelopment) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
}

const server = createServer(async (request, response) => {
  try {
    if (await handleApi(request, response)) return;
    if (vite) {
      vite.middlewares(request, response, (error: unknown) => {
        if (error) {
          console.error("Development request failed.", { code: "VITE_MIDDLEWARE_ERROR" });
          if (!response.headersSent) response.writeHead(500);
          response.end("Internal Server Error");
        }
      });
      return;
    }
    await serveProductionFile(request, response);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      if (!response.headersSent) sendJson(response, 413, { error: "上传内容超过大小限制。" });
      else response.end();
      return;
    }
    console.error("Request failed.", {
      code: "INTERNAL_ERROR",
      method: request.method,
    });
    if (!response.headersSent) sendJson(response, 500, { error: "INTERNAL_ERROR" });
    else response.end();
  }
});

function purgeExpiredCandidateInputs(): void {
  try {
    const result = auditApplication.runCandidateRetention(
      (now) => candidateIntakeApplication.purgeExpired(now),
    );
    if (result.ok && result.run.deletedCount > 0) {
      console.info(`Purged ${result.run.deletedCount} expired candidate input(s).`);
    }
    if (!result.ok) {
      console.error("Candidate input cleanup failed.", {
        code: result.run.errorCode,
        retentionRunId: result.run.id,
      });
    }
  } catch {
    console.error("Candidate input cleanup monitoring failed.", {
      code: "RETENTION_MONITORING_FAILED",
    });
  }
}

purgeExpiredCandidateInputs();
const candidateCleanupTimer = setInterval(purgeExpiredCandidateInputs, 60 * 60 * 1000);
candidateCleanupTimer.unref();

server.listen(port, host, () => {
  console.log(`Connection Finder running at http://127.0.0.1:${port}`);
});
