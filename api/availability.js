/* ==========================================================================
   GET /api/availability?days=7
   Proxies to the Google Apps Script Web App (LEAD_WEBHOOK_URL) to fetch
   real free/busy appointment slots from the business's Google Calendar.
   Proxied server-side (rather than calling the Apps Script URL directly
   from the browser) to avoid cross-origin fetch issues with Apps Script's
   redirect-based responses.
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

  var days = req.query && req.query.days ? String(req.query.days) : '7';

  try {
    var upstream = await fetch(url + '?action=availability&days=' + encodeURIComponent(days));
    var data = await upstream.json();
    res.status(upstream.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('availability proxy failed:', err);
    res.status(502).json({ ok: false, error: 'Could not load availability' });
  }
};
