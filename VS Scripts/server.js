const http = require('http');
const fs   = require('fs');

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(fs.readFileSync('C:/Job Agent/filtered_jobs.json', 'utf8'));
}).listen(3456, () => console.log('Running on http://localhost:3456'));
