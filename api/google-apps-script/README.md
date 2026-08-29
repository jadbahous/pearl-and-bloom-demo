# Lead sheet + calendar booking backend (Google Apps Script)

This turns a Google Sheet + your Google Calendar into the storage,
notification, and appointment-booking backend for the chat widget. It's
free, needs no API key, and runs entirely under your own Google account —
nothing to install.

It handles three things:

1. Saving leads to a `Leads` tab and emailing you when someone leaves their
   name and number in chat.
2. Reporting free/busy appointment slots from your Google Calendar so the
   widget can show a real booking calendar.
3. Booking a picked slot as an actual Calendar event, then logging that
   booking as a lead too (so it shows up in the sheet either way).

## One-time setup (about 5 minutes)

1. Go to **sheets.google.com** and create a new blank spreadsheet. Name it
   something like `Pearl & Bloom — Leads`.
2. In the sheet, go to **Extensions → Apps Script**. A new tab opens with a
   code editor.
3. Delete the placeholder code in `Code.gs` and paste in the contents of
   `Code.gs` from this folder.
4. On the line with `var ownerEmail = ...`, replace the email address with
   whichever inbox should get lead + booking notifications (defaults to
   jad.bahous@gmail.com).
5. On the line with `var calendarId = 'primary';`, leave it as `'primary'`
   to book against this Google account's main calendar, or swap in a
   dedicated calendar's ID if you'd rather keep patient appointments
   separate from personal events (Google Calendar → hover the calendar in
   the left sidebar → ⋮ → Settings and sharing → Calendar ID).
6. Click **Deploy → New deployment**. Click the gear icon next to
   "Select type" and choose **Web app**.
   - Description: `pearl and bloom lead + booking widget endpoint`
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy**. The first time, Google will ask you to authorize the
   script — click through the "Google hasn't verified this app" warning
   (it's your own script, this is expected) and allow it.
8. Copy the **Web app URL** it gives you (ends in `/exec`). That's your
   `LEAD_WEBHOOK_URL`.
9. Add that URL as an environment variable in this project's Vercel
   settings: Project → Settings → Environment Variables → new variable
   named `LEAD_WEBHOOK_URL`, value is the URL you copied. Redeploy after
   adding it.

### Updating an existing deployment (already have a `/exec` URL)

If you're adding the calendar-booking code to a sheet that's already
deployed, you don't need a new URL: paste the updated `Code.gs` over the old
one, then **Deploy → Manage deployments → (pencil/edit icon) → Version:
New version → Deploy**. The `/exec` URL stays the same, so `LEAD_WEBHOOK_URL`
in Vercel doesn't need to change.

## Keeping pilots separate

This sheet and this deployment are dedicated to Pearl & Bloom only — a
different Google Sheet, a different Apps Script Web App, a different
Calendar, and a different `LEAD_WEBHOOK_URL` than Dune & Bean's. Each pilot
gets its own inbox, its own spreadsheet, and its own calendar; nothing is
shared between them.

## Business hours

Slot availability is generated from `getBusinessHoursForDay()` in `Code.gs`,
currently set to Pearl & Bloom's real hours (Saturday–Thursday 9AM–7PM,
Friday 2PM–7PM) in 30-minute increments, 7 days ahead. Edit `slotMinutes` or
`lookaheadDays` at the top of the file to change either.

## Testing it

Once deployed, every submitted lead adds a row to a `Leads` tab in the sheet
(created automatically on first use) and sends an email to the owner
address. Every booking does the same, plus creates a real event on the
configured calendar. If something doesn't show up, check the Apps Script
"Executions" log (left sidebar in the Apps Script editor) for errors.
