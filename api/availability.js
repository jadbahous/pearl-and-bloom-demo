/* ==========================================================================
   GET /api/availability?days=7
   Proxies to the Google Apps Script Web App (LEAD_WEBHOOK_URL) to fetch
   real free/busy appointment slots from the business's Google Calendar.
   Proxied server-side (rather than calling the Apps Script URL directly
   from the browser) to avoid cross-origin fetch issues with Apps Script's
   redirect-based responses.

   Responses are cached at the edge for 60s (and served stale for up to
   5 min while refreshing) so opening the booking card is near-instant
   after the first hit; a booking invalidates nothing here on purpose —
   the book endpoint re-checks the calendar for conflicts itself.
   ========================================================================== */
var UPSTREAM_TIMEOUT_MS = 25000;

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

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, UPSTREAM_TIMEOUT_MS);

  try {
    var upstream = await fetch(url + '?action=availability&days=' + encodeURIComponent(days), {
      signal: controller.signal,
    });
    var data = await upstream.json();
    if (upstream.ok && data && data.ok) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    res.status(upstream.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('availability proxy failed:', err && err.name === 'AbortError' ? 'upstream timeout' : err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(504).json({ ok: false, error: 'Could not load availability' });
  } finally {
    clearTimeout(timer);
  }
};
