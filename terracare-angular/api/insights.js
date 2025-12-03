// Vercel serverless function for GET /api/insights?lat=..&lng=..
module.exports = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng query params required (numbers)' });
    }

    const key = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const radiusKm = 10;
    const iNatUrl = `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lng}&radius=${radiusKm}&order=desc&order_by=observed_on&per_page=30`;
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const overpassQl = `[out:json][timeout:25];(way["natural"="wood"]["wood"="mangrove"](${lat-0.15},${lng-0.15},${lat+0.15},${lng+0.15});relation["natural"="wood"]["wood"="mangrove"](${lat-0.15},${lng-0.15},${lat+0.15},${lng+0.15}););out body;>;out skel qt;`;
    const openAQUrl = `https://api.openaq.org/v2/latest?coordinates=${lat},${lng}&radius=${radiusKm*1000}`;

    const [iNatResRaw, overpassResRaw, openAQResRaw] = await Promise.all([
      fetch(iNatUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
      fetch(overpassUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: overpassQl }).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
      fetch(openAQUrl).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null),
    ]).catch(() => [null, null, null]);

    let species = [];
    try {
      const results = (iNatResRaw && iNatResRaw.results) || [];
      species = results
        .map((r) => r.taxon?.preferred_common_name || r.taxon?.name)
        .filter((n) => typeof n === 'string' && n.trim().length)
        .reduce((acc, cur) => { if (!acc.includes(cur)) acc.push(cur); return acc; }, [])
        .slice(0, 8);
    } catch {}

    let mangroveDetected = false;
    try { mangroveDetected = !!(overpassResRaw && Array.isArray(overpassResRaw.elements) && overpassResRaw.elements.length > 0); } catch { mangroveDetected = false; }

    let pm25 = null;
    try {
      const results = (openAQResRaw && openAQResRaw.results) || [];
      if (results.length && Array.isArray(results[0].measurements)) {
        const m = results[0].measurements.find((x) => String(x.parameter).toLowerCase() === 'pm25');
        if (m && typeof m.value === 'number') pm25 = m.value;
      }
    } catch {}

    let waterQualityIndex = 60;
    if (pm25 !== null) {
      waterQualityIndex = Math.max(0, Math.min(100, Math.round(100 - pm25 * 2)));
    }
    const mangroveCoverPct = mangroveDetected ? 5 : 0;

    const normalized = {
      waterQualityIndex,
      mangroveCoverPct,
      beachCleanlinessRating: 3,
      speciesObserved: species,
      lastUpdated: new Date().toISOString(),
    };

    return res.status(200).json({ fromCache: false, ...normalized, key });
  } catch (e) {
    console.error('[api/insights] error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'insights aggregation failed' });
  }
};
