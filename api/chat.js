/* ==========================================================================
   POST /api/chat
   Body: { clientId: string, messages: [{ role: 'user'|'assistant', content }] }
   Proxies to the Claude API — the API key lives only here, server-side,
   never in the browser. Reads the business's system prompt from
   _businesses.js by clientId, so the same function serves every client.
   If Claude's reply contains a [[LEAD ...]] marker, the lead is saved
   automatically and the marker is stripped before the reply is returned.
   If it contains a [[SHOW_CALENDAR]] marker, that's stripped too and
   showCalendar:true is returned so the widget can render the booking
   calendar (see chat-widget.js). Both markers are optional per-client —
   a business whose system prompt never emits SHOW_CALENDAR just never
   gets it back, so this stays generic across every pilot.
   ========================================================================== */
var BUSINESSES = require('./_businesses.js');
var saveLead = require('./_lead.js');

var LEAD_RE = /\[\[LEAD\s+name="([^"]*)"\s+phone="([^"]*)"\s+note="([^"]*)"\]\]/;
var SHOW_CALENDAR_RE = /\[\[SHOW_CALENDAR\]\]/;
var MODEL = 'claude-haiku-4-5-20251001';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    var body = req.body || {};
    var clientId = body.clientId;
    var messages = body.messages;

    var biz = BUSINESSES[clientId];
    if (!biz) {
      res.status(400).json({ error: 'Unknown client' });
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'No messages' });
      return;
    }

    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server not configured' });
      return;
    }

    // Keep the payload small: last 16 turns, 2000 chars each, valid roles only.
    var trimmed = messages.slice(-16).map(function (m) {
      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 2000)
      };
    });

    var upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: biz.systemPrompt,
        messages: trimmed
      })
    });

    if (!upstream.ok) {
      console.error('Anthropic error', upstream.status, await upstream.text());
      res.status(502).json({ error: 'Upstream error' });
      return;
    }

    var data = await upstream.json();
    var reply = (data.content && data.content[0] && data.content[0].text) ||
      "Sorry, could you say that again?";

    var showCalendar = SHOW_CALENDAR_RE.test(reply);
    if (showCalendar) {
      reply = reply.replace(SHOW_CALENDAR_RE, '').trim();
    }

    var leadCaptured = false;
    var m = reply.match(LEAD_RE);
    if (m) {
      reply = reply.replace(LEAD_RE, '').trim();
      leadCaptured = await saveLead({
        clientId: clientId,
        name: m[1],
        phone: m[2],
        note: m[3],
        source: 'chat'
      });
    }

    res.status(200).json({ reply: reply, leadCaptured: leadCaptured, showCalendar: showCalendar });
  } catch (err) {
    console.error('chat handler error', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
};
