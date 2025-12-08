const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const DEEPSEEK_API_BASE = "api.deepseek.com";
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) {
  console.warn("Warning: DEEPSEEK_API_KEY environment variable is not set");
}

// Serve static files
function serveStaticFile(reqPath, res) {
  const filePath = reqPath === "/" ? "./index.html" : `.${reqPath}`;
  const extname = path.extname(filePath);

  const contentTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpg",
    ".ico": "image/x-icon",
  };

  const contentType = contentTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404);
        res.end("File not found");
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
}

// Proxy requests to DeepSeek API
function proxyToDeepSeek(req, res) {
  const targetPath = req.url.replace(/^\/api/, "");
  const options = {
    hostname: DEEPSEEK_API_BASE,
    port: 443,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: DEEPSEEK_API_BASE,
      authorization: `Bearer ${API_KEY}`,
    },
  };

  // Remove hop-by-hop headers
  delete options.headers["connection"];
  delete options.headers["content-length"];

  const proxyReq = https.request(options, (proxyRes) => {
    // Forward status code
    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    // Pipe the response
    proxyRes.pipe(res, {
      end: true,
    });
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy request error:", err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: "Proxy error" }));
  });

  // Pipe the request body if it exists
  req.pipe(proxyReq, {
    end: true,
  });
}

// Main server
const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);

  // Serve index.html at root
  if (parsedUrl.pathname === "/") {
    return serveStaticFile("/", res);
  }

  // Proxy API requests
  if (parsedUrl.pathname.startsWith("/api/")) {
    if (!API_KEY) {
      res.writeHead(500);
      return res.end(
        JSON.stringify({
          error:
            "DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable.",
        })
      );
    }
    return proxyToDeepSeek(req, res);
  }

  // Serve other static files if they exist
  serveStaticFile(parsedUrl.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API proxy available at http://localhost:${PORT}/api/*`);
});
