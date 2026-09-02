# WhatsApp appointment reminders (optional, Pearl & Bloom only)

Sends a WhatsApp message to every patient the day before their booked
appointment. This is separate from the free lead + booking system — it's
an optional add-on that talks to Meta's WhatsApp Business Cloud API
directly (no third-party biller, no per-message markup beyond Meta's own
utility-message rate, currently about $0.015/message in most regions).

**Start this early.** The template-approval and business-verification
steps below can take anywhere from a few hours to ~2 weeks, and nothing
else in this doc depends on you finishing them in order — you can request
verification and submit the template on day one, then come back and wire
up the credentials once they clear.

## Why this needs its own setup

Reminders are sent *outside* the 24-hour window after a patient last
messaged the business, so WhatsApp requires them to use a pre-approved
**template message** rather than free-form text — this is a WhatsApp
platform rule, not something this project can work around.

## One-time setup

1. **Meta Business Manager.** Go to
   [business.facebook.com](https://business.facebook.com) and create a
   Business Manager account if you don't already have one (a personal
   Facebook account is enough to start).
2. **Create a Meta app.** Go to
   [developers.facebook.com](https://developers.facebook.com/apps) →
   **Create App** → choose the **Business** app type → give it a name
   like "Pearl and Bloom Reminders" and attach it to your Business
   Manager account.
3. **Add the WhatsApp product.** On the app's dashboard, scroll to
   **WhatsApp** and click **Set up**. This takes you to the WhatsApp →
   **API Setup** page, which is where you'll come back for the phone
   number ID and token in steps 5–6.
4. **Register a phone number.** Under WhatsApp → API Setup, add the
   phone number that should send reminders. It must **not** currently be
   active in the regular WhatsApp consumer or Business app — Meta will
   either register a fresh number or migrate an existing one (which
   removes it from the phone's regular WhatsApp app). Decide which
   number you want to use for this before starting; it doesn't have to
   be the same number listed on the Pearl & Bloom site.
5. **Create the reminder template.** In
   [Meta Business Suite](https://business.facebook.com) → **WhatsApp
   Manager** → **Message Templates** → **Create Template**:
   - Category: **Utility**
   - Name: `appointment_reminder` (must match `WHATSAPP_TEMPLATE_NAME`
     in step 8 exactly)
   - Language: **English (US)**
   - Body:
     ```
     Hi {{1}}, this is a reminder from Pearl & Bloom Dental Studio for
     your appointment on {{2}} at {{3}}. Reply to this message if you
     need to reschedule.
     ```
   - When asked for sample values for the variables (required for
     review), use something like: `Sarah`, `Wed, Sep 2`, `9:00 AM`.
   - Submit for review. Meta typically clears straightforward utility
     templates like this one within a day or two, but it can take
     longer during high-volume review periods.
6. **Request Business Verification.** Still in Business Manager, under
   **Security Center** → **Business verification**, submit your business
   details (a corporate-domain email, if you have one, tends to clear
   faster than a Gmail address). This is what unlocks sending to phone
   numbers outside your own testing list, and can take anywhere from
   minutes to about two weeks depending on the review queue and your
   documents.
7. **Generate a permanent access token.** The token shown on the API
   Setup page by default expires in 24 hours — fine for testing, not for
   the daily trigger. Go to Business Settings → **Users** → **System
   Users** → create a system user → assign it to your WhatsApp app with
   full control → **Generate token** → select the app and the
   `whatsapp_business_messaging` permission → generate and copy it
   somewhere safe (Meta only shows it once).
8. **Add the credentials to Apps Script.** Open the Pearl & Bloom
   `Code.gs` project → **File → Project Settings** → scroll to **Script
   Properties** → **Add script property**, and add all three:
   - `WHATSAPP_TOKEN` — the permanent token from step 7
   - `WHATSAPP_PHONE_NUMBER_ID` — from WhatsApp → API Setup (labeled
     "Phone number ID", not the phone number itself)
   - `WHATSAPP_TEMPLATE_NAME` — `appointment_reminder` (or whatever you
     named it in step 5)
9. **Install the daily trigger.** Back in the Apps Script editor, select
   `setupReminderTrigger` in the function dropdown next to Run, and click
   **Run** once. Approve any authorization prompt — this grants the
   trigger-management scope, the same one-time flow as the earlier
   Calendar permission. From then on, `sendAppointmentReminders` runs
   automatically every day at the hour set by `reminderHour` in
   `Code.gs` (10am by default).

## How it decides who to remind

Once a day, it pulls every Calendar event happening the *next* calendar
day, reads the patient's name and phone back out of the event
description (written there automatically by the booking flow), and sends
one reminder per event. After a successful send it appends `[reminded]`
to that event's description so it's never double-sent, even if the
trigger somehow runs twice.

Phone numbers typed without a country code are assumed to be Qatar
numbers (`defaultCountryCode = '+974'` in `Code.gs`) — change that if
this gets reused for a business elsewhere.

## Testing it

Book a test appointment for tomorrow through the site's chat widget with
your own WhatsApp number, then in the Apps Script editor select
`sendAppointmentReminders` and click **Run** rather than waiting for the
daily trigger. Check the **Executions** log (left sidebar) for errors —
a `401` means the token is wrong or expired, a `132001`-style error in
the response body usually means the template name or language doesn't
match what Meta approved.

## Costs

Meta doesn't charge for the app, the Business Manager account, or
template approval. Utility-category messages like this reminder cost
roughly $0.015 each once you're past any free monthly conversation
allowance Meta grants — check the current rate for Qatar under WhatsApp
Manager → **Overview** → **Pricing**, since rates vary by country and do
change.
