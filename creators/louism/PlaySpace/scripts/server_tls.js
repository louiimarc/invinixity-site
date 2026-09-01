const fs = require("fs");
const http = require("http");
const https = require("https");

function createServerSettings(defaultHttpPort = 8080) {
  let certificatePath = String(process.env.PLAYSPACE_TLS_CERT || "").trim();
  let privateKeyPath = String(process.env.PLAYSPACE_TLS_KEY || "").trim();
  if ((certificatePath == "") != (privateKeyPath == "")) {
    throw new Error(
      "PLAYSPACE_TLS_CERT and PLAYSPACE_TLS_KEY must be configured together",
    );
  }

  let secure = certificatePath != "";
  let defaultPort = secure ? 8443 : defaultHttpPort;
  let port = Number.parseInt(
    process.env.PLAYSPACE_PORT || String(defaultPort),
    10,
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PLAYSPACE_PORT must be a valid TCP port");
  }

  let protocol = secure ? "https" : "http";
  let createServer = secure
    ? (handler) => https.createServer({
        cert: fs.readFileSync(certificatePath),
        key: fs.readFileSync(privateKeyPath),
      }, handler)
    : (handler) => http.createServer(handler);

  return {
    certificatePath,
    createServer,
    port,
    privateKeyPath,
    protocol,
    secure,
  };
}

module.exports = { createServerSettings };
