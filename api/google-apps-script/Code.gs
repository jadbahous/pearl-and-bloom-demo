/**
 * Lead + booking widget backend — Google Apps Script Web App.
 * Paste this whole file into Extensions > Apps Script on a Google Sheet,
 * then deploy as a Web App (see README.md in this folder for the steps).
 *
 * Handles three things:
 *   1. Saving leads to the "Leads" sheet + emailing the owner (doPost, default).
 *   2. Reporting free/busy appointment slots from Google Calendar (doGet ?action=availability).
 *   3. Booking a slot as a real Calendar event, then logging it as a lead too (doPost action:"book").
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
