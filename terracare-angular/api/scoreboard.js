// Serverless function for Vercel: /api/scoreboard
// Returns aggregated environmental indicators (iNaturalist, OpenAQ, Overpass)
// This is a lightweight replacement for the server-side /api/scoreboard proxy
const fetch = global.fetch;

module.exports = async (req, res) => {
  try {
    const lat = Number(req.query?.lat ?? (req.url && new URL(req.url, `http://${req.headers.host}`).searchParams.get('lat')) ) || 12.8797;
    const lng = Number(req.query?.lng ?? (req.url && new URL(req.url, `http://${req.headers.host}`).searchParams.get('lng')) ) || 121.7740;
    const radius = Number(req.query?.radius ?? (req.url && new URL(req.url, `http://${req.headers.host}`).searchParams.get('radius')) ) || 50000;

    const inatUrl = `https://api.inaturalist.org/v1/observations?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${Math.round(radius/1000)}&per_page=1`;
    const openAQUrl = `https://api.openaq.org/v2/latest?coordinates=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&radius=${Math.round(radius)}`;
    const overpassQl = `[out:json][timeout:25];(node(around:${Math.round(radius)},${lat},${lng})[natural=wood];way(around:${Math.round(radius)},${lat},${lng})[natural=wood];relation(around:${Math.round(radius)},${lat},${lng})[natural=wood];node(around:${Math.round(radius)},${lat},${lng})[landuse=forest];way(around:${Math.round(radius)},${lat},${lng})[landuse=forest];relation(around:${Math.round(radius)},${lat},${lng})[landuse=forest];);out body;`;

    const [inatResp, openAQResp, overpassResp] = await Promise.all([
      fetch(inatUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
      fetch(openAQUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
      fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: overpassQl }).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
    ]).catch(() => [null, null, null]);

    const biodCount = Number(inatResp?.total_results ?? inatResp?.results?.length ?? 0) || 0;
    let pm25 = null;
    try {
      const results = openAQResp?.results || [];
      if (Array.isArray(results) && results.length) {
        for (const r of results) {
          const m = Array.isArray(r.measurements) ? r.measurements.find(x => String(x.parameter).toLowerCase() === 'pm25') : null;
          if (m && typeof m.value === 'number') { pm25 = m.value; break; }
        }
      }
    } catch (e) { pm25 = null; }

    const forestCount = Array.isArray(overpassResp?.elements) ? overpassResp.elements.length : 0;

    const scores = {
      biodiversity: Math.min(100, Math.round((Math.log(biodCount + 1) / Math.log(5000 + 1)) * 100)) || 0,
      air: pm25 === null ? 0 : Math.max(0, Math.min(100, Math.round((1 - (pm25 / 100)) * 100))),
      forest: Math.min(100, Math.round((Math.log(forestCount + 1) / Math.log(2000 + 1)) * 100)) || 0,
    };

    res.setHeader('Content-Type', 'application/json');
    return res.statusCode ? res.end(JSON.stringify({ ok: true, meta: { biodiversityCount: biodCount, pm25, forestCount }, scores, lastUpdated: new Date().toISOString(), source: 'vercel-function' })) : res.end(JSON.stringify({ ok: true, meta: { biodiversityCount: biodCount, pm25, forestCount }, scores, lastUpdated: new Date().toISOString(), source: 'vercel-function' }));
  } catch (err) {
    console.error('api/scoreboard error', err);
    try { res.setHeader('Content-Type', 'application/json'); res.statusCode = 500; return res.end(JSON.stringify({ error: 'scoreboard_failed', message: String(err?.message || err) })); } catch {};
    return;
  }
};
