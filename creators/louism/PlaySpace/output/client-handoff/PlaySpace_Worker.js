const MAXIMUM_POSTER_BYTES = 20 * 1024 * 1024;
const EXPIRY_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAXIMUM_HOME_EXAMPLES = 50;
const MAXIMUM_HOME_EXCLUSIONS = 1000;
const HOME_EXCLUSIONS_KEY = "moderation/home-exclusions.json";
// The event kiosk runs on localhost or a Bonjour .local hostname, both of
// which are accepted by isDevelopmentOrigin(). Add a public web kiosk origin
// here only if IdeaFest later chooses to host the creative interface online.
const ALLOWED_ORIGINS = new Set([]);

function requestOrigin(request) {
  return request.headers.get("Origin") || "";
}

function isDevelopmentOrigin(origin) {
  try {
    let url = new URL(origin);
    let hostname = url.hostname;
    let parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
    let privateIpv4 = parts.length == 4 && parts.every(Number.isFinite) && (
      parts[0] == 10 ||
      (parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] == 192 && parts[1] == 168)
    );
    return hostname == "localhost" ||
      hostname == "127.0.0.1" ||
      hostname == "[::1]" ||
      hostname.endsWith(".local") ||
      privateIpv4;
  } catch (error) {
    return false;
  }
}

function corsOrigin(request) {
  let origin = requestOrigin(request);
  if (ALLOWED_ORIGINS.has(origin) || isDevelopmentOrigin(origin)) return origin;
  return "";
}

function responseHeaders(request, extra = {}) {
  let origin = corsOrigin(request);
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(origin == "" ? {} : {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    }),
    ...extra,
  };
}

function json(request, status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders(request, {
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}

function rejectUntrustedWrite(request) {
  return corsOrigin(request) == "";
}

function randomToken() {
  let bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function isPng(bytes) {
  let signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.byteLength >= signature.length &&
    signature.every((value, index) => bytes[index] == value);
}

async function posterBytes(request) {
  let length = Number.parseInt(request.headers.get("Content-Length") || "0", 10);
  if (length > MAXIMUM_POSTER_BYTES) return null;
  let buffer = await request.arrayBuffer();
  if (buffer.byteLength == 0 || buffer.byteLength > MAXIMUM_POSTER_BYTES) {
    return null;
  }
  let bytes = new Uint8Array(buffer);
  return isPng(bytes) ? buffer : null;
}

function publicOrigin(request) {
  return new URL(request.url).origin;
}

function posterKey(token) {
  return `posters/${token}.png`;
}

function exampleKey(token, timestamp = Date.now()) {
  return `examples/${String(timestamp).padStart(13, "0")}-${token}.png`;
}

function exampleUrl(request, key) {
  return `${publicOrigin(request)}/example/${encodeURIComponent(
    key.slice("examples/".length),
  )}`;
}

function validHomeExclusionIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) =>
    typeof value == "string" &&
    /^\/example\/\d{13}-[A-Za-z0-9_-]+\.png$/.test(value)
  ))].slice(0, MAXIMUM_HOME_EXCLUSIONS);
}

async function readHomeModeration(env) {
  let object = await env.POSTERS.get(HOME_EXCLUSIONS_KEY);
  if (object == null) {
    return { version: 1, updatedAt: null, excludedExampleIds: [] };
  }
  try {
    let payload = JSON.parse(await object.text());
    return {
      version: 1,
      updatedAt: payload.updatedAt || null,
      excludedExampleIds: validHomeExclusionIds(
        payload.excludedExampleIds,
      ),
    };
  } catch (error) {
    console.warn("Unable to read Home moderation object", error);
    return { version: 1, updatedAt: null, excludedExampleIds: [] };
  }
}

async function writeHomeModeration(request, env) {
  if (rejectUntrustedWrite(request)) {
    return json(request, 403, { error: "Origin is not allowed" });
  }
  let length = Number.parseInt(
    request.headers.get("Content-Length") || "0",
    10,
  );
  if (length > 64 * 1024) {
    return json(request, 413, { error: "Moderation list is too large" });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json(request, 400, { error: "Invalid moderation JSON" });
  }
  let saved = {
    version: 1,
    updatedAt: new Date().toISOString(),
    excludedExampleIds: validHomeExclusionIds(
      payload.excludedExampleIds,
    ),
  };
  await env.POSTERS.put(HOME_EXCLUSIONS_KEY, JSON.stringify(saved), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return json(request, 200, saved);
}

function objectExpired(object) {
  let expiresAt = Number(object?.customMetadata?.expiresAt || 0);
  return expiresAt > 0 && expiresAt <= Date.now();
}

async function putExample(request, env, bytes, token = randomToken()) {
  let key = exampleKey(token);
  let expiresAt = Date.now() + EXPIRY_MILLISECONDS;
  await env.POSTERS.put(key, bytes, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { expiresAt: String(expiresAt) },
  });
  return { key, expiresAt };
}

async function uploadPoster(request, env) {
  if (rejectUntrustedWrite(request)) {
    return json(request, 403, { error: "Origin is not allowed" });
  }
  let bytes = await posterBytes(request);
  if (bytes == null) {
    return json(request, 415, {
      error: "Poster must be a PNG smaller than 20 MB",
    });
  }
  let token = randomToken();
  let expiresAt = Date.now() + EXPIRY_MILLISECONDS;
  let example = await putExample(request, env, bytes, token);
  await env.POSTERS.put(posterKey(token), bytes, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { expiresAt: String(expiresAt) },
  });
  let origin = publicOrigin(request);
  return json(request, 201, {
    token,
    downloadUrl: `${origin}/d/${token}`,
    posterImageUrl: `${origin}/poster/${token}.png`,
    exampleUrl: exampleUrl(request, example.key),
    expiresAt,
  });
}

async function uploadExample(request, env) {
  if (rejectUntrustedWrite(request)) {
    return json(request, 403, { error: "Origin is not allowed" });
  }
  let bytes = await posterBytes(request);
  if (bytes == null) {
    return json(request, 415, {
      error: "Example must be a PNG smaller than 20 MB",
    });
  }
  let saved = await putExample(request, env, bytes);
  let filename = saved.key.slice("examples/".length);
  return json(request, 201, {
    filename,
    url: exampleUrl(request, saved.key),
    expiresAt: saved.expiresAt,
  });
}

async function listExamples(request, env) {
  let [listed, moderation] = await Promise.all([
    env.POSTERS.list({
      prefix: "examples/",
      limit: 1000,
      include: ["customMetadata"],
    }),
    readHomeModeration(env),
  ]);
  let objects = listed.objects
    .filter((object) => !objectExpired(object))
    .sort((left, right) => right.uploaded - left.uploaded)
    .slice(0, MAXIMUM_HOME_EXAMPLES);
  return json(request, 200, {
    examples: objects.map((object) => exampleUrl(request, object.key)),
    excludedExampleIds: moderation.excludedExampleIds,
    moderationUpdatedAt: moderation.updatedAt,
  });
}

async function serveImage(request, env, key, download = false) {
  let object = await env.POSTERS.get(key);
  if (object == null || objectExpired(object)) {
    if (object != null) await env.POSTERS.delete(key);
    return new Response("Poster expired", {
      status: 404,
      headers: responseHeaders(request, {
        "Content-Type": "text/plain; charset=utf-8",
      }),
    });
  }
  let headers = new Headers(responseHeaders(request, {
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": download
      ? 'attachment; filename="PlaySpace-poster.png"'
      : 'inline; filename="PlaySpace-poster.png"',
    "Content-Type": "image/png",
    "ETag": object.httpEtag,
  }));
  return new Response(request.method == "HEAD" ? null : object.body, {
    status: 200,
    headers,
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadPage(token) {
  let imageUrl = `/poster/${encodeURIComponent(token)}.png`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#4D1430">
  <title>Your PlaySpace poster</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(145deg, #fff8e9, #f7c7dc 55%, #dcebf4); color: #1d1d1d; font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif; }
    main { width: min(100%, 520px); margin: 0 auto; padding: 28px 22px 44px; text-align: center; }
    .brand { margin: 0 0 8px; color: #4D1430; font-size: 15px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0 0 20px; font-size: clamp(30px, 9vw, 48px); line-height: .98; }
    .poster { display: block; width: 100%; border-radius: 24px; box-shadow: 0 18px 55px rgba(77, 20, 48, .18); }
    .download { display: block; margin-top: 22px; padding: 17px 22px; border-radius: 999px; background: #7D9664; color: white; font-size: 19px; font-weight: 800; text-decoration: none; }
    .note { margin: 15px 0 0; color: #655d61; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <p class="brand">PlaySpace</p>
    <h1>Your poster is ready!</h1>
    <img class="poster" src="${escapeHtml(imageUrl)}" alt="Your finished PlaySpace poster">
    <a class="download" href="${escapeHtml(imageUrl)}?download=1">Download poster</a>
    <p class="note">Available for 1 day.</p>
  </main>
</body>
</html>`;
}

async function serveDownloadPage(request, env, token) {
  let object = await env.POSTERS.head(posterKey(token));
  if (object == null || objectExpired(object)) {
    if (object != null) await env.POSTERS.delete(posterKey(token));
    return new Response("This poster has expired.", {
      status: 404,
      headers: responseHeaders(request, {
        "Content-Type": "text/plain; charset=utf-8",
      }),
    });
  }
  return new Response(downloadPage(token), {
    headers: responseHeaders(request, {
      "Content-Type": "text/html; charset=utf-8",
    }),
  });
}

async function handleRequest(request, env) {
  let url = new URL(request.url);
  let pathname = url.pathname;

  if (request.method == "OPTIONS") {
    if (corsOrigin(request) == "") return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: responseHeaders(request),
    });
  }

  if (request.method == "GET" && pathname == "/api/config") {
    return json(request, 200, {
      publicOrigin: publicOrigin(request),
      wifiName: "PlaySpace",
      wifiPassword: "",
      wifiSecurity: "WPA",
      skipWifi: true,
      expiryMinutes: EXPIRY_MILLISECONDS / 60000,
    });
  }

  if (request.method == "GET" && pathname == "/api/examples") {
    return listExamples(request, env);
  }
  if (request.method == "GET" && pathname == "/api/examples/moderation") {
    return json(request, 200, await readHomeModeration(env));
  }
  if (request.method == "POST" && pathname == "/api/examples/moderation") {
    return writeHomeModeration(request, env);
  }
  if (request.method == "POST" && pathname == "/api/examples") {
    return uploadExample(request, env);
  }
  if (request.method == "POST" && pathname == "/api/posters") {
    return uploadPoster(request, env);
  }

  let posterMatch = pathname.match(/^\/poster\/([A-Za-z0-9_-]+)\.png$/);
  if ((request.method == "GET" || request.method == "HEAD") && posterMatch) {
    return serveImage(
      request,
      env,
      posterKey(posterMatch[1]),
      url.searchParams.has("download"),
    );
  }

  let exampleMatch = pathname.match(/^\/example\/([^/]+\.png)$/);
  if ((request.method == "GET" || request.method == "HEAD") && exampleMatch) {
    let filename;
    try {
      filename = decodeURIComponent(exampleMatch[1]);
    } catch (error) {
      return json(request, 400, { error: "Invalid example URL" });
    }
    if (!/^\d{13}-[A-Za-z0-9_-]+\.png$/.test(filename)) {
      return json(request, 400, { error: "Invalid example URL" });
    }
    return serveImage(request, env, `examples/${filename}`);
  }

  let downloadMatch = pathname.match(/^\/d\/([A-Za-z0-9_-]+)$/);
  if (request.method == "GET" && downloadMatch) {
    return serveDownloadPage(request, env, downloadMatch[1]);
  }

  if (request.method == "GET" && pathname == "/health") {
    return json(request, 200, { ok: true, storage: Boolean(env.POSTERS) });
  }

  return json(request, 404, { error: "Not found" });
}

export default {
  async fetch(request, env) {
    try {
      if (env.POSTERS == null) {
        return json(request, 503, { error: "R2 binding is unavailable" });
      }
      return await handleRequest(request, env);
    } catch (error) {
      console.error(error);
      return json(request, 500, { error: "Poster service error" });
    }
  },
};
