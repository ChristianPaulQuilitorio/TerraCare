const http = require('http');
const url = 'http://localhost:4000/api/insights?lat=15.247&lng=119.9819';
http.get(url, (res) => {
  const { statusCode } = res;
  let raw = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => raw += chunk);
  res.on('end', () => {
    console.log('status', statusCode);
    console.log(raw);
  });
}).on('error', (e) => {
  console.error('http.get failed:', e && e.stack ? e.stack : e);
  process.exit(2);
});

