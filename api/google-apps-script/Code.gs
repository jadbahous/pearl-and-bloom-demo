/**
 * Lead + booking widget backend — Google Apps Script Web App.
 * Paste this whole file into Extensions > Apps Script on a Google Sheet,
 * then deploy as a Web App (see README.md in this folder for the steps).
 *
 * Handles four things:
 *   1. Saving leads to the "Leads" sheet + emailing the owner (doPost, default).
 *   2. Reporting free/busy appointment slots from Google Calendar (doGet ?action=availability).
 *   3. Booking a slot as a real Calendar event, then logging it as a lead too (doPost action:"book").
 *   4. Reporting lead/booking stats for the analytics dashboard (doGet ?action=stats).
 */

// Change this to whichever inbox should receive lead + booking notifications.
var ownerEmail = 'jad.bahous@gmail.com';

// Which calendar to check/book against. 'primary' uses this account's main
// calendar. Swap in a dedicated Calendar ID (Calendar settings → Integrate
// calendar → Calendar ID) if you'd rather keep appointments separate from
// your personal calendar.
var calendarId = 'primary';

// Timezone used for formatting/business-hours math.
var timezone = 'Asia/Qatar';

// Appointment slot length, in minutes.
var slotMinutes = 30;

// How many days ahead to offer for booking.
var lookaheadDays = 7;

// Default country code applied to any phone number that arrives without a
// leading '+' (patients usually just type the local number in the booking
// form). Used for WhatsApp reminders, which need a full international number.
var defaultCountryCode = '+974';

// What hour of day (in `timezone`) the reminder check runs. It looks at
// every appointment happening the following calendar day and WhatsApps
// each one a reminder, once.
var reminderHour = 10;

// What hour of day (in `timezone`) the review-request check runs. It looks
// at every appointment that happened the previous calendar day and WhatsApps
// each patient a one-time request to leave a Google review.
var reviewHour = 18;

// Your Google Business Profile's short review link (Google Business Profile
// → "Ask for reviews" → copy link). Replace this placeholder before turning
// on review requests — sending patients a broken link is worse than not
// asking at all.
var googleReviewLink = 'https://g.page/r/REPLACE_WITH_YOUR_REVIEW_LINK/review';

/* ── Business hours ──────────────────────────────────────────────
   0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
   Pearl & Bloom: Saturday–Thursday 9:00–19:00, Friday 14:00–19:00. ── */
function getBusinessHoursForDay(dayOfWeek) {
  if (dayOfWeek === 5) return { start: 14, end: 19 };
  return { start: 9, end: 19 };
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'availability') {
    return handleAvailability(e);
  }
  if (action === 'stats') {
    return handleStats(e);
  }
  return ContentService.createTextOutput('Lead widget endpoint is live.');
}

function doPost(e) {
  var data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ ok: false, error: 'Bad JSON' });
  }

  if (data.action === 'book') {
    return handleBook(data);
  }
  return handleLead(data);
}

/* ── Availability ─────────────────────────────────────────────── */
function handleAvailability(e) {
  var days = parseInt((e.parameter && e.parameter.days) || String(lookaheadDays), 10);
  var cal = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
  var now = new Date();
  var result = [];

  for (var d = 0; d < days; d++) {
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    var hours = getBusinessHoursForDay(day.getDay());
    var slots = [];
    var slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours.start, 0, 0);
    var dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours.end, 0, 0);

    while (slotStart < dayEnd) {
      var slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);
      if (slotStart > now) {
        var busy = cal.getEvents(slotStart, slotEnd).length > 0;
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: Utilities.formatDate(slotStart, timezone, 'h:mm a'),
          available: !busy
        });
      }
      slotStart = slotEnd;
    }

    if (slots.length > 0) {
      result.push({
        date: Utilities.formatDate(day, timezone, 'yyyy-MM-dd'),
        dateLabel: Utilities.formatDate(day, timezone, 'EEE, MMM d'),
        slots: slots
      });
    }
  }

  return jsonOutput({ ok: true, days: result });
}

/* ── Booking ──────────────────────────────────────────────────── */
function handleBook(data) {
  if (!data.start || !data.end || !data.name || !data.phone) {
    return jsonOutput({ ok: false, error: 'Missing start, end, name, or phone' });
  }

  var cal = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
  var start = new Date(data.start);
  var end = new Date(data.end);

  // Re-check right before booking to avoid a race with someone else grabbing
  // the same slot between the visitor loading the calendar and confirming.
  var conflicts = cal.getEvents(start, end);
  if (conflicts.length > 0) {
    return jsonOutput({ ok: false, error: 'That slot was just taken — pick another.' });
  }

  var title = (data.name || 'New booking') +
    (data.clientId ? ' — ' + data.clientId : '');
  var description =
    'Name: ' + (data.name || '') + '\n' +
    'Phone: ' + (data.phone || '') + '\n' +
    'Note: ' + (data.note || '') + '\n' +
    'Booked via chat widget.';

  cal.createEvent(title, start, end, { description: description });

  logLeadRow({
    time: new Date().toISOString(),
    clientId: data.clientId || '',
    name: data.name || '',
    phone: data.phone || '',
    note: 'Booked: ' + Utilities.formatDate(start, timezone, 'EEE MMM d, h:mm a'),
    source: 'booking'
  });

  notifyOwner(
    'New booking: ' + (data.name || 'Unknown') + (data.clientId ? ' (' + data.clientId + ')' : ''),
    'New appointment booked!\n\n' +
      'Business: ' + (data.clientId || '') + '\n' +
      'Name: ' + (data.name || '') + '\n' +
      'Phone: ' + (data.phone || '') + '\n' +
      'When: ' + Utilities.formatDate(start, timezone, 'EEE MMM d, h:mm a') + '\n' +
      'Note: ' + (data.note || '') + '\n'
  );

  return jsonOutput({ ok: true });
}

/* ── Stats (for the analytics dashboard) ─────────────────────────
   Requires a `key` query param matching DASHBOARD_KEY in Script
   Properties, so lead/patient data isn't reachable by anyone who
   guesses the URL. Set DASHBOARD_KEY once in File → Project Settings
   → Script Properties, then use that same passphrase on the dashboard
   page (see dashboard.html on the site). ── */
function handleStats(e) {
  var key = e && e.parameter && e.parameter.key;
  var expected = PropertiesService.getScriptProperties().getProperty('DASHBOARD_KEY');
  if (!expected || key !== expected) {
    return jsonOutput({ ok: false, error: 'Not authorized' });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads');
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonOutput({ ok: true, totalLeads: 0, totalBookings: 0, bySource: {}, byDay: [] });
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  var bySource = {};
  var byDayMap = {};
  var totalBookings = 0;
  var lookbackDays = 14;
  var now = new Date();

  // Pre-seed the last two weeks with zero so the chart has no gaps.
  for (var d = lookbackDays - 1; d >= 0; d--) {
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    byDayMap[Utilities.formatDate(day, timezone, 'yyyy-MM-dd')] = 0;
  }

  rows.forEach(function (row) {
    var source = row[5] || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
    if (source === 'booking') totalBookings++;

    var rowDate = new Date(row[0]);
    if (!isNaN(rowDate.getTime())) {
      var dayKey = Utilities.formatDate(rowDate, timezone, 'yyyy-MM-dd');
      if (byDayMap.hasOwnProperty(dayKey)) byDayMap[dayKey]++;
    }
  });

  var byDay = Object.keys(byDayMap).sort().map(function (k) {
    return { date: k, count: byDayMap[k] };
  });

  return jsonOutput({
    ok: true,
    totalLeads: rows.length,
    totalBookings: totalBookings,
    bySource: bySource,
    byDay: byDay
  });
}

/* ── Sheet dashboard tab (native charts, for quick reference) ─────
   Refreshes a "Dashboard" tab in this spreadsheet with lead/booking
   totals and two native Sheets charts — no website involved, just
   something to glance at whenever you open the sheet. Run buildDashboard
   once manually, or run setupDashboardTrigger once to refresh it
   automatically every morning. ── */
function buildDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var leads = ss.getSheetByName('Leads');
  if (!leads || leads.getLastRow() < 2) return;

  var dash = ss.getSheetByName('Dashboard');
  if (!dash) {
    dash = ss.insertSheet('Dashboard');
  } else {
    dash.getCharts().forEach(function (c) { dash.removeChart(c); });
    dash.clear();
  }

  var rows = leads.getRange(2, 1, leads.getLastRow() - 1, 6).getValues();
  var bySource = {};
  var byDayMap = {};
  var lookbackDays = 14;
  var now = new Date();
  for (var d = lookbackDays - 1; d >= 0; d--) {
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    byDayMap[Utilities.formatDate(day, timezone, 'MMM d')] = 0;
  }
  rows.forEach(function (row) {
    var source = row[5] || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
    var rowDate = new Date(row[0]);
    if (!isNaN(rowDate.getTime())) {
      var label = Utilities.formatDate(rowDate, timezone, 'MMM d');
      if (byDayMap.hasOwnProperty(label)) byDayMap[label]++;
    }
  });

  dash.getRange('A1').setValue('Pearl & Bloom — Lead Dashboard').setFontWeight('bold').setFontSize(14);
  dash.getRange('A2').setValue('Updated: ' + Utilities.formatDate(now, timezone, 'EEE, MMM d, h:mm a'));

  dash.getRange('A4').setValue('Total leads');
  dash.getRange('B4').setValue(rows.length);
  dash.getRange('A5').setValue('Total bookings');
  dash.getRange('B5').setValue(bySource['booking'] || 0);

  dash.getRange('A7').setValue('Source').setFontWeight('bold');
  dash.getRange('B7').setValue('Count').setFontWeight('bold');
  var sourceRow = 8;
  Object.keys(bySource).forEach(function (src) {
    dash.getRange(sourceRow, 1).setValue(src);
    dash.getRange(sourceRow, 2).setValue(bySource[src]);
    sourceRow++;
  });

  var dayStartRow = sourceRow + 2;
  dash.getRange(dayStartRow, 1).setValue('Day').setFontWeight('bold');
  dash.getRange(dayStartRow, 2).setValue('Leads').setFontWeight('bold');
  var r = dayStartRow + 1;
  Object.keys(byDayMap).forEach(function (label) {
    dash.getRange(r, 1).setValue(label);
    dash.getRange(r, 2).setValue(byDayMap[label]);
    r++;
  });

  if (sourceRow > 8) {
    var sourceChart = dash.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(dash.getRange(7, 1, sourceRow - 7, 2))
      .setPosition(4, 4, 0, 0)
      .setOption('title', 'Leads by source')
      .build();
    dash.insertChart(sourceChart);
  }

  var trendChart = dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(dayStartRow, 1, r - dayStartRow, 2))
    .setPosition(20, 4, 0, 0)
    .setOption('title', 'Leads per day (last 14 days)')
    .build();
  dash.insertChart(trendChart);
}

function setupDashboardTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildDashboard') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('buildDashboard')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .inTimezone(timezone)
    .create();
}

/* ── Leads (plain, non-booking) ──────────────────────────────────
   Same behavior as before this file grew a booking flow. ── */
function handleLead(data) {
  logLeadRow({
    time: data.time || new Date().toISOString(),
    clientId: data.clientId || '',
    name: data.name || '',
    phone: data.phone || '',
    note: data.note || '',
    source: data.source || ''
  });

  notifyOwner(
    'New lead: ' + (data.name || 'Unknown') + (data.clientId ? ' (' + data.clientId + ')' : ''),
    'New lead captured!\n\n' +
      'Business: ' + (data.clientId || '') + '\n' +
      'Name: ' + (data.name || '') + '\n' +
      'Phone: ' + (data.phone || '') + '\n' +
      'Note: ' + (data.note || '') + '\n' +
      'Source: ' + (data.source || '') + '\n' +
      'Time: ' + (data.time || '') + '\n'
  );

  return jsonOutput({ ok: true });
}

/* ── Shared helpers ───────────────────────────────────────────── */
function logLeadRow(row) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Leads');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Time', 'Business', 'Name', 'Phone', 'Note', 'Source']);
  }
  sheet.appendRow([row.time, row.clientId, row.name, row.phone, row.note, row.source]);
}

function notifyOwner(subject, body) {
  try {
    MailApp.sendEmail(ownerEmail, subject, body);
  } catch (err) {
    // The sheet row is already saved even if the email fails — don't block on it.
  }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── WhatsApp automation (reminders + review requests) ───────────────
   Two daily jobs, both talking to Meta's WhatsApp Cloud API directly with
   UrlFetchApp — server-to-server from Apps Script, so there's no CORS
   proxy involved the way availability/booking needed one for browser calls:
     • sendAppointmentReminders — the day before a visit, remind the patient.
     • sendReviewRequests       — the day after a visit, ask for a review.
   They share one set of credentials but need two separate approved
   templates, since each WhatsApp template is single-purpose.

   One-time setup, after Meta has approved both templates:
   1. File → Project Settings → Script Properties → add four properties:
        WHATSAPP_TOKEN               permanent System User access token
        WHATSAPP_PHONE_NUMBER_ID     from Meta's WhatsApp → API Setup page
        WHATSAPP_TEMPLATE_NAME       the approved reminder template's name
        WHATSAPP_REVIEW_TEMPLATE_NAME the approved review-request template's name
      (See WHATSAPP-REMINDERS.md in this folder for how to get these.)
   2. Set `googleReviewLink` above to your real Google Business Profile
      review link.
   3. With setupWhatsAppTriggers selected in the function dropdown, click
      Run once. This installs both daily triggers; re-run it any time you
      change `reminderHour` or `reviewHour` above. Re-authorize if Google
      asks — this adds the trigger-management scope, same as the earlier
      Calendar prompt.
   ── */

function setupWhatsAppTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'sendAppointmentReminders' || fn === 'sendReviewRequests') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sendAppointmentReminders')
    .timeBased()
    .everyDays(1)
    .atHour(reminderHour)
    .inTimezone(timezone)
    .create();
  ScriptApp.newTrigger('sendReviewRequests')
    .timeBased()
    .everyDays(1)
    .atHour(reviewHour)
    .inTimezone(timezone)
    .create();
}

function sendAppointmentReminders() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('WHATSAPP_TOKEN');
  var phoneNumberId = props.getProperty('WHATSAPP_PHONE_NUMBER_ID');
  var templateName = props.getProperty('WHATSAPP_TEMPLATE_NAME');
  if (!token || !phoneNumberId || !templateName) {
    notifyOwner(
      'Reminders not sent — WhatsApp not configured',
      'sendAppointmentReminders ran but WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, or ' +
        'WHATSAPP_TEMPLATE_NAME is missing from Script Properties. See WHATSAPP-REMINDERS.md.'
    );
    return;
  }

  var cal = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
  var windowStart = new Date();
  windowStart.setDate(windowStart.getDate() + 1);
  windowStart.setHours(0, 0, 0, 0);
  var windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);

  var events = cal.getEvents(windowStart, windowEnd);
  events.forEach(function (event) {
    var description = event.getDescription() || '';
    if (description.indexOf('[reminded]') !== -1) return; // already sent

    var phoneMatch = description.match(/Phone:\s*(.+)/);
    if (!phoneMatch || !phoneMatch[1].trim()) return; // nothing to text

    var nameMatch = description.match(/Name:\s*(.+)/);
    var phone = normalizePhone(phoneMatch[1].trim());
    var name = nameMatch ? nameMatch[1].trim() : 'there';
    var dateLabel = Utilities.formatDate(event.getStartTime(), timezone, 'EEE, MMM d');
    var timeLabel = Utilities.formatDate(event.getStartTime(), timezone, 'h:mm a');

    var sent = sendWhatsAppTemplate(token, phoneNumberId, templateName, phone, [name, dateLabel, timeLabel]);
    if (sent) {
      event.setDescription(description + '\n[reminded]');
    } else {
      notifyOwner(
        'Reminder failed to send',
        'Could not WhatsApp-remind ' + name + ' (' + phone + ') about ' + dateLabel + ' at ' + timeLabel + '.'
      );
    }
  });
}

function sendReviewRequests() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('WHATSAPP_TOKEN');
  var phoneNumberId = props.getProperty('WHATSAPP_PHONE_NUMBER_ID');
  var templateName = props.getProperty('WHATSAPP_REVIEW_TEMPLATE_NAME');
  if (!token || !phoneNumberId || !templateName) {
    notifyOwner(
      'Review requests not sent — WhatsApp not configured',
      'sendReviewRequests ran but WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, or ' +
        'WHATSAPP_REVIEW_TEMPLATE_NAME is missing from Script Properties. See WHATSAPP-REMINDERS.md.'
    );
    return;
  }

  var cal = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
  var windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 1);
  windowStart.setHours(0, 0, 0, 0);
  var windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);

  var events = cal.getEvents(windowStart, windowEnd);
  events.forEach(function (event) {
    var description = event.getDescription() || '';
    if (description.indexOf('[reviewed]') !== -1) return; // already sent

    var phoneMatch = description.match(/Phone:\s*(.+)/);
    if (!phoneMatch || !phoneMatch[1].trim()) return; // nothing to text

    var nameMatch = description.match(/Name:\s*(.+)/);
    var phone = normalizePhone(phoneMatch[1].trim());
    var name = nameMatch ? nameMatch[1].trim() : 'there';

    var sent = sendWhatsAppTemplate(token, phoneNumberId, templateName, phone, [name, googleReviewLink]);
    if (sent) {
      event.setDescription(description + '\n[reviewed]');
    } else {
      notifyOwner(
        'Review request failed to send',
        'Could not WhatsApp a review request to ' + name + ' (' + phone + ').'
      );
    }
  });
}

// Turns whatever a patient typed into the phone field into a WhatsApp-ready
// international number. Assumes Qatar (defaultCountryCode) when no country
// code was given, since that's this pilot's market.
function normalizePhone(phone) {
  var cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.indexOf('00') === 0) cleaned = '+' + cleaned.slice(2);
  if (cleaned.indexOf('+') !== 0) cleaned = defaultCountryCode + cleaned;
  return cleaned;
}

function sendWhatsAppTemplate(token, phoneNumberId, templateName, toPhone, params) {
  var url = 'https://graph.facebook.com/v21.0/' + phoneNumberId + '/messages';
  var payload = {
    messaging_product: 'whatsapp',
    to: toPhone.replace('+', ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en_US' },
      components: [{
        type: 'body',
        parameters: params.map(function (p) { return { type: 'text', text: p }; })
      }]
    }
  };

  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    Logger.log('WhatsApp send failed: ' + code + ' ' + res.getContentText());
    return false;
  } catch (err) {
    Logger.log('WhatsApp send error: ' + err);
    return false;
  }
}
