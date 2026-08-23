/* ==========================================================================
   Lead Widget — reusable AI chat + lead-capture button.
   Drop this file into any client site, add the CSS link, and set
   window.LEADWIDGET_CONFIG before this script loads. That's the whole
   integration — no other code needs to change per client.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = Object.assign({
    clientId: 'unknown',
    brand: 'Assistant',
    accent: '#C1592E',
    dark: '#251A13',
    cream: '#F8EFDE',
    sand: '#EFE3CA',
    whatsapp: '',
    greeting: "Hi! How can I help?",
    apiBase: ''
  }, window.LEADWIDGET_CONFIG || {});

  var STORE_KEY = 'leadwidget_' + cfg.clientId;
  var history = [];
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (Array.isArray(saved)) history = saved;
  } catch (e) { /* ignore */ }

  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history)); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------- styles ---- */
  var style = document.createElement('style');
  style.textContent = [
    '.lw-btn{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;',
    'background:' + cfg.accent + ';color:' + cfg.cream + ';border:none;cursor:pointer;z-index:99998;',
    'box-shadow:0 10px 30px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;',
    'transition:transform .25s ease;}',
    '.lw-btn:hover{transform:scale(1.06);}',
    '.lw-btn svg{width:26px;height:26px;}',
    '.lw-badge{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;',
    'background:#2E9E56;border:2px solid ' + cfg.cream + ';}',
    '.lw-panel{position:fixed;right:20px;bottom:92px;width:360px;max-width:calc(100vw - 32px);',
    'height:520px;max-height:calc(100vh - 140px);background:' + cfg.cream + ';border-radius:18px;',
    'box-shadow:0 24px 60px rgba(0,0,0,.35);z-index:99999;display:flex;flex-direction:column;',
    'overflow:hidden;font-family:system-ui,-apple-system,"DM Sans",sans-serif;opacity:0;',
    'transform:translateY(16px) scale(.98);pointer-events:none;transition:opacity .22s ease,transform .22s ease;}',
    '.lw-panel.lw-open{opacity:1;transform:none;pointer-events:auto;}',
    '.lw-head{background:' + cfg.dark + ';color:' + cfg.cream + ';padding:16px 18px;display:flex;',
    'align-items:center;justify-content:space-between;flex:0 0 auto;}',
    '.lw-head-title{font-weight:600;font-size:15px;}',
    '.lw-head-sub{font-size:11.5px;opacity:.65;margin-top:2px;}',
    '.lw-close{background:none;border:none;color:' + cfg.cream + ';opacity:.7;cursor:pointer;padding:4px;}',
    '.lw-close:hover{opacity:1;}',
    '.lw-wa{display:block;padding:8px 18px;font-size:12px;background:' + cfg.sand + ';color:' + cfg.dark + ';',
    'text-decoration:none;flex:0 0 auto;border-bottom:1px solid rgba(0,0,0,.06);}',
    '.lw-wa b{color:#2E9E56;}',
    '.lw-msgs{flex:1 1 auto;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px;}',
    '.lw-row{display:flex;}',
    '.lw-row.me{justify-content:flex-end;}',
    '.lw-bub{max-width:82%;padding:9px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;',
    'white-space:pre-wrap;word-break:break-word;}',
    '.lw-row.bot .lw-bub{background:#fff;color:' + cfg.dark + ';border-bottom-left-radius:4px;',
    'box-shadow:0 1px 3px rgba(0,0,0,.08);}',
    '.lw-row.me .lw-bub{background:' + cfg.accent + ';color:' + cfg.cream + ';border-bottom-right-radius:4px;}',
    '.lw-row.sys .lw-bub{background:rgba(46,158,86,.14);color:#1c6b3a;font-size:12px;border-radius:10px;}',
    '.lw-dots{display:inline-flex;gap:3px;padding:4px 2px;}',
    '.lw-dots span{width:5px;height:5px;border-radius:50%;background:' + cfg.dark + ';opacity:.35;',
    'animation:lwBlink 1.1s infinite ease-in-out;}',
    '.lw-dots span:nth-child(2){animation-delay:.15s;}',
    '.lw-dots span:nth-child(3){animation-delay:.3s;}',
    '@keyframes lwBlink{0%,80%,100%{opacity:.25;}40%{opacity:.8;}}',
    '.lw-inputrow{flex:0 0 auto;display:flex;gap:8px;padding:10px;border-top:1px solid rgba(0,0,0,.08);',
    'background:#fff;}',
    '.lw-input{flex:1;border:1px solid rgba(0,0,0,.14);border-radius:20px;padding:9px 14px;font-size:13.5px;',
    'outline:none;font-family:inherit;}',
    '.lw-input:focus{border-color:' + cfg.accent + ';}',
    '.lw-send{background:' + cfg.accent + ';color:' + cfg.cream + ';border:none;border-radius:50%;',
    'width:36px;height:36px;flex:0 0 auto;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
    '.lw-send:disabled{opacity:.5;cursor:default;}',
    '.lw-send svg{width:16px;height:16px;}',
    '@media (max-width:420px){.lw-panel{right:16px;left:16px;width:auto;bottom:88px;}}'
  ].join('');
  document.head.appendChild(style);

  /* ------------------------------------------------------------- DOM ---- */
  var btn = document.createElement('button');
  btn.className = 'lw-btn';
  btn.setAttribute('aria-label', 'Chat with ' + cfg.brand);
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 4h16v11H8l-4 4V4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '</svg><span class="lw-badge"></span>';

  var panel = document.createElement('div');
  panel.className = 'lw-panel';
  panel.innerHTML =
    '<div class="lw-head">' +
      '<div><div class="lw-head-title">' + esc(cfg.brand) + '</div>' +
      '<div class="lw-head-sub">Usually replies in seconds</div></div>' +
      '<button class="lw-close" aria-label="Close">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '</button>' +
    '</div>' +
    (cfg.whatsapp ? '<a class="lw-wa" href="https://wa.me/' + cfg.whatsapp + '" target="_blank" rel="noopener">Prefer WhatsApp? <b>Message us directly →</b></a>' : '') +
    '<div class="lw-msgs" id="lwMsgs"></div>' +
    '<div class="lw-inputrow">' +
      '<input class="lw-input" id="lwInput" type="text" placeholder="Type a message…" autocomplete="off">' +
      '<button class="lw-send" id="lwSend" aria-label="Send">' +
        '<svg viewBox="0 0 24 24" fill="none"><path d="M3 11l18-8-8 18-2-8-8-2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
      '</button>' +
    '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var msgsEl = panel.querySelector('#lwMsgs');
  var inputEl = panel.querySelector('#lwInput');
  var sendEl = panel.querySelector('#lwSend');
  var open = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function addBubble(role, text) {
    var row = document.createElement('div');
    row.className = 'lw-row ' + (role === 'user' ? 'me' : role === 'system' ? 'sys' : 'bot');
    var b = document.createElement('div');
    b.className = 'lw-bub';
    b.textContent = text;
    row.appendChild(b);
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return row;
  }

  function addTyping() {
    var row = document.createElement('div');
    row.className = 'lw-row bot';
    row.innerHTML = '<div class="lw-bub"><span class="lw-dots"><span></span><span></span><span></span></span></div>';
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return row;
  }

  function renderHistory() {
    msgsEl.innerHTML = '';
    if (history.length === 0) {
      addBubble('assistant', cfg.greeting);
    } else {
      history.forEach(function (m) { addBubble(m.role, m.content); });
    }
  }

  async function send(text) {
    text = text.trim();
    if (!text) return;
    history.push({ role: 'user', content: text });
    addBubble('user', text);
    persist();
    inputEl.value = '';
    sendEl.disabled = true;
    var typingRow = addTyping();

    try {
      var res = await fetch((cfg.apiBase || '') + '/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: cfg.clientId, messages: history })
      });
      var data = await res.json();
      typingRow.remove();
      if (!res.ok || !data.reply) {
        addBubble('assistant', "Sorry, I'm having trouble right now — please WhatsApp us instead.");
      } else {
        history.push({ role: 'assistant', content: data.reply });
        addBubble('assistant', data.reply);
        persist();
        if (data.leadCaptured) {
          addBubble('system', "✓ Got it — we've saved your details and the team will follow up.");
        }
      }
    } catch (err) {
      typingRow.remove();
      addBubble('assistant', "Sorry, something went wrong — please WhatsApp us instead.");
    } finally {
      sendEl.disabled = false;
      inputEl.focus();
    }
  }

  btn.addEventListener('click', function () {
    open = !open;
    panel.classList.toggle('lw-open', open);
    if (open) { renderHistory(); inputEl.focus(); }
  });
  panel.querySelector('.lw-close').addEventListener('click', function () {
    open = false;
    panel.classList.remove('lw-open');
  });
  sendEl.addEventListener('click', function () { send(inputEl.value); });
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send(inputEl.value);
  });
})();
