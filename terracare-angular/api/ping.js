// Simple diagnostic endpoint to verify Vercel function routing
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, env: process.env['NODE_ENV'] || null, ts: new Date().toISOString() }));
};
