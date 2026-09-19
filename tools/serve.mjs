import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const root = new URL("../", import.meta.url);
export async function startServer({ port = 8080, html } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        return res.end();
      }
      if (
        name !== "/" &&
        name !== "/index.html" &&
        (!/^\/(js|css|imgs)\/[\w/-]+\.(js|css|png|svg|ico)$/.test(name) ||
          name.includes(".."))
      ) {
        res.writeHead(404);
        return res.end();
      }
      const entry = name === "/" || name === "/index.html";
      const body =
        entry && html !== undefined
          ? html
          : await readFile(new URL(entry ? "index.html" : name.slice(1), root));
      const type = entry
        ? "text/html; charset=utf-8"
        : name.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : name.endsWith(".css")
            ? "text/css; charset=utf-8"
            : name.endsWith(".svg")
              ? "image/svg+xml"
              : "image/png";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(
    process.argv.find((a) => a.startsWith("--port="))?.slice(7) ?? 8080,
  );
  const server = await startServer({ port });
  await mkdir(new URL("output/", root), { recursive: true });
  await writeFile(
    new URL("output/local-server.json", root),
    JSON.stringify({ pid: process.pid, port: server.address().port }),
  );
  console.log("Старая админка: http://127.0.0.1:" + server.address().port);
}
