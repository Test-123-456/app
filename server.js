// AMIS Planner — local static server
// Run: node server.js
// Open: http://localhost:3030/planner.html

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3030;
const ROOT = path.join(__dirname, 'reports');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === '/' ? '/planner.html' : req.url);
  // strip query strings
  filePath = filePath.split('?')[0];

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('');
  console.log('  ✅  AMIS Planner server running');
  console.log('  🌐  http://localhost:' + PORT + '/planner.html');
  console.log('');
  console.log('  Keep this window open. Press Ctrl+C to stop.');
  console.log('');
});
