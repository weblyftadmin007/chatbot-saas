/**
 * Google Apps Script - Weblyft Design Booking Notifications
 *
 * Per-tenant GAS web app for the "weblyft-design" chatbot tenant. Runs in
 * Weblyft Design's Google account so it can send email from their Gmail and
 * log bookings straight into their appointments Google Sheet.
 *
 * The Worker calls this script's /exec URL with `type: 'booking'` or
 * `type: 'cancellation'` payloads. This script (idempotent per appointment_id
 * — retries never duplicate emails or sheet rows):
 *
 *
 * SETUP (ONE TIME, in Google):
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire code
 * 3. Set SPREADSHEET_ID below to the Weblyft Design appointments sheet
 *    (or leave blank and set the sheet ID in the admin dashboard — the Worker
 *    passes `spreadsheet_id`, which takes precedence).
 * 4. Set TEST_RECIPIENT to your own email, then run testEmail() + testBooking()
 *    once to authorize Gmail + Sheets.
 * 5. Deploy → New Deployment → Type: "Web App" / Execute as: "Me" /
 *    Who has access: "Anyone". Copy the URL ending in /exec.
 * 6. Paste that /exec URL + the business notification email (+ sheet ID) into
 *    the admin dashboard → Tenant → Settings → "Notifications & Integrations"
 *    for the weblyft-design tenant.
 */

/**
 * Optional shared secret. If set here AND in the weblyft-design tenant's
 * settings (gas_secret), incoming requests must include a matching `secret`
 * field in their JSON body (Apps Script's doPost does not receive HTTP
 * headers). Leave blank to disable verification (not recommended — anyone
 * with the /exec URL could inject rows into your sheet or send emails from
 * this account).
 */
var WEBHOOK_SECRET = '';

/**
 * Optional spreadsheet ID used when the Worker request omits `spreadsheet_id`.
 * PRE-FILL with the Weblyft Design appointments sheet (or set in the dashboard).
 */
var SPREADSHEET_ID = 'PASTE_WEBLYFT_DESIGN_SHEET_ID_HERE';

/**
 * Your real receiving address for test emails. CHANGE THIS.
 */
var TEST_RECIPIENT = 'you@gmail.com';

function doPost(e) {
  try {
    // Parse incoming JSON
    const data = JSON.parse(e.postData.contents);

    if (WEBHOOK_SECRET && data.secret !== WEBHOOK_SECRET) {
      return replyError('Invalid webhook secret');
    }

    if (!data.type) {
      // Legacy/back-compat: plain email payload {to, subject, html}
      return handleEmail(data);
    }

    if (data.type === 'booking') {
      return handleBooking(data);
    }

    if (data.type === 'cancellation') {
      return handleCancellation(data);
    }

    if (data.type === 'email') {
      return handleEmail(data);
    }

    return replyError('Unknown request type: ' + data.type);
  } catch (error) {
    return replyError(error.toString());
  }
}

function checkQuotaOrError() {
  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('Gmail daily quota exhausted');
  }
}

/** Format an epoch in the tenant's timezone (falls back to the script tz). */
function formatWhen(epochSec, tz) {
  try {
    return Utilities.formatDate(new Date(epochSec * 1000), tz || Session.getScriptTimeZone(), 'EEE d MMM yyyy, HH:mm');
  } catch (err) {
    return new Date(epochSec * 1000).toLocaleString();
  }
}

function formatUntil(epochSec, tz) {
  try {
    return Utilities.formatDate(new Date(epochSec * 1000), tz || Session.getScriptTimeZone(), 'HH:mm');
  } catch (err) {
    return new Date(epochSec * 1000).toLocaleTimeString();
  }
}

function handleEmail({ to, subject, html }) {
  if (!to || !subject || !html) {
    return replyError('Missing required fields: to, subject, html');
  }
  MailApp.sendEmail({
    to: to,
    subject: subject,
    htmlBody: html,
    name: 'Chatbot Appointments'
  });
  return replySuccess();
}

function handleBooking(data) {
  const {
    appointment_id,
    tenant_name,
    customer_name,
    customer_email,
    start_time,
    end_time,
    title,
    notification_email,
    spreadsheet_id,
    timezone
  } = data;

  const when = formatWhen(start_time, timezone);
  const until = formatUntil(end_time, timezone);
  const tenantLabel = tenant_name || 'the business';
  const customerLabel = customer_name || 'there';
  const emailsSent = [];

  if (!customer_email && !notification_email) {
    return replyError('No recipients provided (customer_email / notification_email both missing)');
  }

  // 1 + 2. Emails are idempotent: sent once per appointment_id (shared marker).
  // Per-action results (already_sent) let the Worker retry a half-failed
  // delivery (e.g. business email errored while the customer email went out).
  const alreadySent = hasSent(appointment_id);
  if (!alreadySent) {
    checkQuotaOrError();
  }
  if (customer_email && !alreadySent) {
    try {
      MailApp.sendEmail({
        to: customer_email,
        subject: 'Your booking is confirmed',
        htmlBody:
          '<p>Hi ' + customerLabel + ',</p>' +
          '<p>Your appointment with <strong>' + tenantLabel + '</strong> is confirmed:</p>' +
          '<p><strong>' + (title || 'Appointment') + '</strong><br>' +
          when + ' – ' + until + '</p>' +
          '<p>We look forward to seeing you. If you need to change or cancel, just reply to this email or contact us directly.</p>'
      });
      emailsSent.push('customer');
    } catch (emailError) {
      return replyError('customer email failed: ' + emailError.toString());
    }
  }
  if (notification_email && !alreadySent) {
    try {
      MailApp.sendEmail({
        to: notification_email,
        subject: 'New booking: ' + (customer_name || customer_email || 'a customer'),
        htmlBody:
          '<p>A new appointment was just booked:</p>' +
          '<ul>' +
          '<li><strong>' + (title || 'Appointment') + '</strong></li>' +
          '<li>' + when + ' – ' + until + '</li>' +
          '<li>Customer: ' + (customer_name || '—') + ' (' + (customer_email || '—') + ')</li>' +
          '<li>Appointment ID: ' + (appointment_id || '—') + '</li>' +
          '</ul>'
      });
      emailsSent.push('business');
    } catch (emailError) {
      return replyError('business email failed: ' + emailError.toString());
    }
  }
  if (!alreadySent && emailsSent.length) {
    PropertiesService.getScriptProperties().setProperty('sent_' + appointment_id, new Date().toISOString());
  }

  // 3. Append to the appointments Google Sheet (idempotent by appointment_id)
  const sheetId = spreadsheet_id || SPREADSHEET_ID;
  let sheetResult = 'skipped_no_sheet';
  if (sheetId) {
    try {
      const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
      if (appointmentExists(sheet, appointment_id)) {
        sheetResult = 'skipped_dupe';
      } else {
        sheet.appendRow([
          appointment_id || '',
          new Date(start_time * 1000),
          new Date(end_time * 1000),
          title || 'Appointment',
          customer_name || '',
          customer_email || '',
          'confirmed',
          new Date()
        ]);
        sheetResult = 'appended';
      }
    } catch (sheetError) {
      sheetResult = 'error:' + sheetError.toString();
    }
  }

  return replySuccess({ emails_sent: emailsSent, sheet: sheetResult });
}

/**
 * Cancellation notice: emails the customer (+ business) that an appointment
 * was cancelled. No sheet write — the original booking row stays as history.
 * Deduped by appointment_id like bookings, so retries never double-send.
 */
function handleCancellation(data) {
  const {
    appointment_id,
    tenant_name,
    customer_name,
    customer_email,
    start_time,
    end_time,
    title,
    notification_email,
    timezone
  } = data;

  const when = formatWhen(start_time, timezone);
  const tenantLabel = tenant_name || 'the business';
  const customerLabel = customer_name || 'there';
  const emailsSent = [];

  if (!customer_email && !notification_email) {
    return replyError('No recipients provided (customer_email / notification_email both missing)');
  }
  if (!hasSent('cancel_' + appointment_id)) {
    checkQuotaOrError();
    try {
      if (customer_email) {
        MailApp.sendEmail({
          to: customer_email,
          subject: 'Your appointment was cancelled',
          htmlBody:
            '<p>Hi ' + customerLabel + ',</p>' +
            '<p>Your appointment with <strong>' + tenantLabel + '</strong> has been cancelled:</p>' +
            '<p><strong>' + (title || 'Appointment') + '</strong><br>' + when + '</p>' +
            '<p>If this was a mistake or you\'d like to rebook, just reply to this email or contact us directly.</p>'
        });
        emailsSent.push('customer');
      }
      if (notification_email) {
        MailApp.sendEmail({
          to: notification_email,
          subject: 'Cancellation: ' + (customer_name || customer_email || 'a customer'),
          htmlBody:
            '<p>An appointment was cancelled:</p>' +
            '<ul>' +
            '<li><strong>' + (title || 'Appointment') + '</strong></li>' +
            '<li>' + when + '</li>' +
            '<li>Customer: ' + (customer_name || '—') + ' (' + (customer_email || '—') + ')</li>' +
            '<li>Appointment ID: ' + (appointment_id || '—') + '</li>' +
            '</ul>'
        });
        emailsSent.push('business');
      }
      PropertiesService.getScriptProperties().setProperty('cancel_sent_' + appointment_id, new Date().toISOString());
    } catch (emailError) {
      return replyError('cancellation email failed: ' + emailError.toString());
    }
  }

  return replySuccess({ emails_sent: emailsSent, sheet: 'skipped_cancellation' });
}

function hasSent(appointmentId) {
  return !!appointmentId && !!PropertiesService.getScriptProperties().getProperty('sent_' + appointmentId);
}

function appointmentExists(sheet, appointmentId) {
  if (!appointmentId) return false;
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;
  const ids = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === appointmentId) return true;
  }
  return false;
}

function replySuccess(extra) {
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({ success: true }, extra || {})))
    .setMimeType(ContentService.MimeType.JSON);
}

function replyError(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Test function - run this once after deploying to authorize the script
 */
function testEmail() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: WEBHOOK_SECRET, // so the test passes the doPost secret check
        to: TEST_RECIPIENT, // Your email — set TEST_RECIPIENT above
        subject: 'Test from Chatbot',
        html: '<h1>It works!</h1><p>Appointment emails are ready to go.</p>'
      })
    }
  });

  Logger.log(result.getContent());
}

/**
 * Test the booking handler end-to-end (customer + business + sheet row).
 */
function testBooking() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: WEBHOOK_SECRET, // so the test passes the doPost secret check
        type: 'booking',
        appointment_id: 'test-' + Math.floor(Date.now() / 1000),
        tenant_name: 'Weblyft Design',
        customer_name: 'Test User',
        customer_email: TEST_RECIPIENT,
        notification_email: TEST_RECIPIENT,
        start_time: Math.floor(Date.now() / 1000) + 86400,
        end_time: Math.floor(Date.now() / 1000) + 86400 + 1800,
        title: 'Consultation',
        spreadsheet_id: SPREADSHEET_ID || undefined
      })
    }
  });

  Logger.log(result.getContent());
}

/**
 * Check daily quota
 */
function checkQuota() {
  const quota = MailApp.getRemainingDailyQuota();
  Logger.log(`Remaining emails today: ${quota}`);
  return quota;
}

/**
 * Test the cancellation handler end-to-end (customer + business email).
 */
function testCancellation() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: WEBHOOK_SECRET, // so the test passes the doPost secret check
        type: 'cancellation',
        appointment_id: 'test-cancel-' + Math.floor(Date.now() / 1000),
        tenant_name: 'Weblyft Design',
        customer_name: 'Test User',
        customer_email: TEST_RECIPIENT,
        notification_email: TEST_RECIPIENT,
        start_time: Math.floor(Date.now() / 1000) + 86400,
        end_time: Math.floor(Date.now() / 1000) + 86400 + 1800,
        title: 'Consultation'
      })
    }
  });

  Logger.log(result.getContent());
}