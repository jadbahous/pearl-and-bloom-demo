/* ==========================================================================
   GET /api/stats?key=...
   Proxies to the Google Apps Script Web App (LEAD_WEBHOOK_URL) to fetch
   lead/booking analytics for the dashboard page. The passphrase in `key`
   is just forwarded through — all real validation happens inside Apps
   Script's handleStats(), which checks it against the DASHBOARD_KEY
   Script Property. This proxy exists only to avoid cross-origin fetch
   issues with Apps Script's redirect-based responses, same as availability.
   ========================================================================== */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var url = process.env.LEAD_WEBHOOK_URL;
  if (!url) {
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  var key = req.query && req.query.key ? String(req.query.key) : '';

  try {
    var upstream = await fetch(url + '?action=stats&key=' + encodeURIComponent(key));
    var data = await upstream.json();
    res.status(upstream.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('stats proxy failed:', err);
    res.status(502).json({ ok: false, error: 'Could not load stats' });
  }
};
