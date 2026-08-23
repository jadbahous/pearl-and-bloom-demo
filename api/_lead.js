/* ==========================================================================
   Shared lead-saving helper. Forwards a captured lead to the Google Apps
   Script Web App URL (stored as the LEAD_WEBHOOK_URL environment variable),
   which appends it to a Google Sheet and emails the owner. Both /api/chat
   (automatic capture) and /api/lead (manual form) call this.
   ========================================================================== */
module.exports = async function saveLead(lead) {
  var url = process.env.LEAD_WEBHOOK_URL;
  if (!url) {
    console.error('LEAD_WEBHOOK_URL is not set — lead was not saved:', lead);
    return false;
  }
  try {
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: lead.clientId || 'unknown',
        name: lead.name || '',
        phone: lead.phone || '',
        note: lead.note || '',
        source: lead.source || 'chat',
        time: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (err) {
    console.error('saveLead failed:', err);
    return false;
  }
};
