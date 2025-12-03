// Vercel function for GET /api/plantings returning sample GeoJSON
module.exports = async (_req, res) => {
  try {
    const sample = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { species: 'Narra', planted_at: '2025-11-01' }, geometry: { type: 'Point', coordinates: [120.9822, 14.6042] } },
        { type: 'Feature', properties: { species: 'Mango', planted_at: '2025-10-12' }, geometry: { type: 'Point', coordinates: [122.5678, 10.3157] } },
        { type: 'Feature', properties: { species: 'Bamboo', planted_at: '2025-09-21' }, geometry: { type: 'Point', coordinates: [120.9820, 15.2470] } },
        { type: 'Feature', properties: { species: 'Acacia', planted_at: '2025-08-15' }, geometry: { type: 'Point', coordinates: [121.7740, 12.8797] } },
      ]
    };
    return res.status(200).json(sample);
  } catch (e) {
    console.error('[api/plantings] error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'failed to load plantings' });
  }
};
