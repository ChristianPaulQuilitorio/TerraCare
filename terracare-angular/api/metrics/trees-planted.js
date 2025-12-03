// Vercel function for GET /api/metrics/trees-planted
module.exports = async (_req, res) => {
  try {
    // Without Supabase, return a sensible fallback
    return res.status(200).json({ count: 1250, source: 'fallback-dev' });
  } catch (e) {
    console.error('[api/metrics/trees-planted] error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'failed to compute trees planted' });
  }
};
