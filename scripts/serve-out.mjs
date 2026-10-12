import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, '..', 'out');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Log all requests for network audit verification
export const requestLog = [];

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(urlObj.pathname);

  // Record access log
  requestLog.push({
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    pathname,
    query: Object.fromEntries(urlObj.searchParams.entries()),
    headers: req.headers,
  });

  // Resolve file path
  let filePath = path.join(OUT_DIR, pathname);

  if (pathname === '/' || pathname === '') {
    filePath = path.join(OUT_DIR, 'index.html');
  } else if (fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    } else if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else {
      filePath = path.join(OUT_DIR, '404.html');
      res.statusCode = 404;
    }
  } else if (!fs.existsSync(filePath)) {
    filePath = path.join(OUT_DIR, '404.html');
    res.statusCode = 404;
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(content);
  } catch (err) {
    res.statusCode = 500;
    res.end('Internal Server Error: ' + err.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Static Production Server] Running at http://127.0.0.1:${PORT}`);
  console.log(`[Static Production Server] Serving files from ${OUT_DIR}`);
});
