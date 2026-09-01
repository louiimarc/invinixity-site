const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = __dirname;
const port = Number.parseInt(process.env.PLAYSPACE_PORT || "8080", 10);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".glsl": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function currentLocalHostname() {
  try {
    let name = childProcess.execFileSync(
      "/usr/sbin/scutil",
      ["--get", "LocalHostName"],
      { encoding: "utf8" },
    ).trim();
    if (name != "") return `${name}.local`;
  } catch (error) {
    // Fall through to Node's hostname outside macOS.
  }
  let name = os.hostname().trim();
  return name.endsWith(".local") ? name : `${name}.local`;
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function handleRequest(request, response) {
  if (request.method != "GET" && request.method != "HEAD") {
    send(response, 405, "Method not allowed");
    return;
  }

  let url = new URL(request.url, "http://localhost");
  let relative;
  try {
    relative = url.pathname == "/"
      ? "index.html"
      : decodeURIComponent(url.pathname.slice(1));
  } catch (error) {
    send(response, 400, "Invalid URL");
    return;
  }
  if (relative.split("/").some((part) => part == "" || part.startsWith("."))) {
    send(response, 403, "Forbidden");
    return;
  }

  let filePath = path.resolve(root, relative);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    send(response, 403, "Forbidden");
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error != null || !stat.isFile()) {
      send(response, 404, "Not found");
      return;
    }
    let extension = path.extname(filePath).toLowerCase();
    let cacheControl = [".png", ".svg", ".ttf", ".m4a", ".glsl"].includes(
      extension,
    )
      ? "public, max-age=3600"
      : "no-cache";
    response.writeHead(200, {
      "Cache-Control": cacheControl,
      "Content-Length": stat.size,
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method == "HEAD") response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
}

let server = http.createServer(handleRequest);
server.listen(port, "0.0.0.0", () => {
  console.log(`PlaySpace kiosk: http://localhost:${port}`);
  console.log(`iPad address: http://${currentLocalHostname()}:${port}`);
});
