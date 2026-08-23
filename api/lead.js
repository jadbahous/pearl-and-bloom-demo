/* ==========================================================================
   POST /api/lead
   Body: { clientId, name, phone, note }
   Manual capture endpoint — used if you ever add a plain "Leave your
   number" form outside the chat widget. Same save path as automatic
   chat capture, so every lead lands in the same sheet either way.
   ========================================================================== */
var saveLead = require('./_lead.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var body = req.body || {};
  if (!body.name || !body.phone) {
    res.status(400).json({ error: 'Name and phone are required' });
    return;
  }

  var ok = await saveLead({
    clientId: body.clientId,
    name: body.name,
    phone: body.phone,
    note: body.note,
    source: 'form'
  });

  res.status(ok ? 200 : 502).json({ ok: ok });
};
