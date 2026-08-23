/**
 * Lead widget backend — Google Apps Script Web App.
 * Paste this whole file into Extensions > Apps Script on a Google Sheet,
 * then deploy as a Web App (see README.md in this folder for the steps).
 */

// Change this to whichever inbox should receive lead notifications.
var ownerEmail = 'jad.bahous@gmail.com';

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Leads');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Time', 'Business', 'Name', 'Phone', 'Note', 'Source']);
  }

  var data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'Bad JSON' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([
    data.time || new Date().toISOString(),
    data.clientId || '',
    data.name || '',
    data.phone || '',
    data.note || '',
    data.source || ''
  ]);

  var subject = 'New lead: ' + (data.name || 'Unknown') +
    (data.clientId ? ' (' + data.clientId + ')' : '');
  var body =
    'New lead captured!\n\n' +
    'Business: ' + (data.clientId || '') + '\n' +
    'Name: ' + (data.name || '') + '\n' +
    'Phone: ' + (data.phone || '') + '\n' +
    'Note: ' + (data.note || '') + '\n' +
    'Source: ' + (data.source || '') + '\n' +
    'Time: ' + (data.time || '') + '\n';

  try {
    MailApp.sendEmail(ownerEmail, subject, body);
  } catch (err) {
    // Row is already saved even if the email fails — don't block on it.
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lets you sanity-check the deployed URL by opening it in a browser.
function doGet(e) {
  return ContentService.createTextOutput('Lead widget endpoint is live.');
}
