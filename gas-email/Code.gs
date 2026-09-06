/**
 * Google Apps Script - Per-Tenant Booking Notifications for the Chatbot
 *
 * Runs in the TENANT's Google account, so it has access to their Gmail and
 * Google Sheets. The Worker calls each tenant's /exec URL with a `type:`
 * payload after an appointment is created; this script handles:
 *
 *   1. Confirmations (customer + business email, Sheet append).
 *   2. Cancellations (customer + business email, Sheet row marked cancelled).
 *   3. Reminders (customer + business email, no Sheet write).
 *
 * Each is idempotent per appointment_id (dedupe markers in
 * ScriptProperties), so retries never double-send or double-touch the Sheet.
 *
 * SETUP INSTRUCTIONS (per tenant):
 * 1. Go to https://script.google.com
 * 2. Click "New Project"
 * 3. Paste this entire code
 * 4. Optional: set SPREADSHEET_ID below to the tenant's appointments sheet
 *    (otherwise the Worker passes `spreadsheet_id`, which takes precedence).
 * 5. Click "Deploy" → "New Deployment"
 * 6. Type: "Web App" / Execute as: "Me" / Who has access: "Anyone"
 * 7. Click "Deploy", copy the URL (ends with /exec)
 * 8. Paste that URL + the business notification email + sheet ID into the
 *    admin dashboard → Tenant → Settings → "Notifications & Integrations".
 * 9. Run testEmail() once to authorize (set TEST_RECIPIENT first).
 */

/**
 * Optional shared secret. If set here AND in the tenant's settings (gas_secret),
 * incoming requests must include a matching `secret` field in their JSON body
 * (Apps Script's doPost does not receive HTTP headers). Leave blank to disable
 * verification (not recommended — anyone with the /exec URL could inject rows
 * into your sheet or send emails from your account).
 */
var WEBHOOK_SECRET = '';

/**
 * Optional spreadsheet ID used when the Worker request omits `spreadsheet_id`.
 * You can leave this blank if you always set the sheet in the dashboard.
 */
var SPREADSHEET_ID = '';

/**
 * Your real receiving address for test emails. CHANGE THIS.
 */
var TEST_RECIPIENT = 'you@gmail.com';

function doPost(e) {
  try {
    if (WEBHOOK_SECRET && e.postData && e.postData.contents) {
      const body = JSON.parse(e.postData.contents);
      if (WEBHOOK_SECRET && body.secret !== WEBHOOK_SECRET) {
        return replyError('Invalid webhook secret');
      }
    }

    // Parse incoming JSON
    const data = JSON.parse(e.postData.contents);

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

    if (data.type === 'reminder') {
      return handleReminder(data);
    }

    if (data.type === 'email') {
      return handleEmail(data);
    }

    return replyError('Unknown request type: ' + data.type);
  } catch (error) {
    return replyError(error.toString());
  }
}

/**
 * Standard JSON responses. GAS web apps return ContentService output;
 * the Worker parses the body as JSON.
 */
function replySuccess(extra) {
  const body = Object.assign({ success: true }, extra || {});
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function replyError(message) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(message) }))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkQuotaOrError() {
  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('Gmail daily quota exhausted');
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
  const alreadySent = hasSent('sent_' + appointment_id);
  if (!alreadySent) checkQuotaOrError();

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
      return replyError('booking customer email failed: ' + emailError.toString());
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
      return replyError('booking business email failed: ' + emailError.toString());
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
 * was cancelled, AND updates the existing Sheet row to 'cancelled' so the
 * Sheet stays the tenant's booking truth (no stale confirmed rows). Deduped
 * by appointment_id; retries never double-send or double-mark.
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
    spreadsheet_id,
    timezone
  } = data;

  const when = formatWhen(start_time, timezone);
  const tenantLabel = tenant_name || 'the business';
  const customerLabel = customer_name || 'there';
  const emailsSent = [];

  if (!customer_email && !notification_email) {
    return replyError('No recipients provided (customer_email / notification_email both missing)');
  }
  const alreadySent = hasSent('cancel_sent_' + appointment_id);
  if (!alreadySent) checkQuotaOrError();

  if (customer_email && !alreadySent) {
    try {
      MailApp.sendEmail({
        to: customer_email,
        subject: 'Your appointment was cancelled',
        htmlBody:
          '<p>Hi ' + customerLabel + ',</p>' +
          '<p>Your appointment with <strong>' + tenantLabel + '</strong> has been cancelled:</p>' +
          '<p><strong>' + (title || 'Appointment') + '</strong><br>' + when + '</p>' +
          '<p>If this was a mistake or you' + String.fromCharCode(8217) + 'd like to rebook, just reply to this email or contact us directly.</p>'
      });
      emailsSent.push('customer');
    } catch (emailError) {
      return replyError('cancellation customer email failed: ' + emailError.toString());
    }
  }
  if (notification_email && !alreadySent) {
    try {
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
    } catch (emailError) {
      return replyError('cancellation business email failed: ' + emailError.toString());
    }
  }
  if (!alreadySent && emailsSent.length) {
    PropertiesService.getScriptProperties().setProperty('cancel_sent_' + appointment_id, new Date().toISOString());
  }

  // Mark the existing Sheet row as cancelled (yes on Sheet side; no new row).
  const sheetResult = updateSheetRowCancelled(appointment_id, spreadsheet_id || SPREADSHEET_ID);

  return replySuccess({ emails_sent: emailsSent, sheet: sheetResult });
}

/**
 * Mark the matching Sheet row's status column as 'cancelled'. Assumes the
 * Sheet has its status value in column 7 (the booking appendRow writes
 * 'confirmed' there). No new row is created — this keeps the Sheet as a
 * clean booking log rather than a mix of live/archived rows.
 */
function updateSheetRowCancelled(appointmentId, sheetId) {
  if (!appointmentId || !sheetId) return 'skipped_no_sheet';
  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return 'skipped_empty_sheet';
    const ids = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === appointmentId) {
        const current = String(sheet.getRange(i + 1, 7).getValue() || 'confirmed').trim().toLowerCase();
        if (current === 'cancelled') return 'already_cancelled';
        sheet.getRange(i + 1, 7).setValue('cancelled');
        sheet.getRange(i + 1, 8).setValue(new Date());
        return 'marked_cancelled';
      }
    }
    return 'row_not_found';
  } catch (sheetError) {
    return 'error:' + sheetError.toString();
  }
}

/**
 * True if the appointments sheet already has a row for this appointment_id
 * (column 1). Used to keep booking appends idempotent across retries.
 */
function appointmentExists(sheet, appointmentId) {
  if (!appointmentId) return false;
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;
  const ids = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === appointmentId) return true;
  }
  return false;
}

function hasSent(key) {
  // `key` is the FULL marker name ('sent_<id>', 'cancel_sent_<id>', 'reminded_<id>').
  return !!key && !!PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * 24-hour (ish) before-appointment reminder. Sends the customer a reminder
 * email; no Sheet write (the booking row already exists). Idempotent by
 * appointment_id via the reminded_<id> marker so a cron sweep can rerun safely.
 */
function handleReminder(data) {
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
  if (!hasSent('reminded_' + appointment_id)) {
    checkQuotaOrError();
    try {
      if (customer_email) {
        MailApp.sendEmail({
          to: customer_email,
          subject: 'Reminder: your appointment is tomorrow',
          htmlBody:
            '<p>Hi ' + customerLabel + ',</p>' +
            '<p>Just a reminder about your upcoming appointment:</p>' +
            '<p><strong>' + (title || 'Appointment') + '</strong><br>' + when + '</p>' +
            '<p>If you need to change or cancel, just reply to this email or contact us directly.</p>'
        });
        emailsSent.push('customer');
      }
      if (notification_email) {
        MailApp.sendEmail({
          to: notification_email,
          subject: 'Reminder sent for: ' + (customer_name || customer_email || 'a customer'),
          htmlBody:
            '<p>A reminder email was sent to a customer for their upcoming appointment:</p>' +
            '<ul>' +
            '<li><strong>' + (title || 'Appointment') + '</strong></li>' +
            '<li>' + when + '</li>' +
            '<li>Customer: ' + (customer_name || '—') + ' (' + (customer_email || '—') + ')</li>' +
            '<li>Appointment ID: ' + (appointment_id || '—') + '</li>' +
            '</ul>'
        });
        emailsSent.push('business');
      }
      PropertiesService.getScriptProperties().setProperty('reminded_' + appointment_id, new Date().toISOString());
    } catch (emailError) {
      return replyError('reminder email failed: ' + emailError.toString());
    }
  }

  return replySuccess({ emails_sent: emailsSent, sheet: 'skipped_reminder_no_write' });
}

/**
 * Check daily quota
 */
function checkQuota() {
  const quota = MailApp.getRemainingDailyQuota();
  Logger.log('Remaining emails today: ' + quota);
  return quota;
}

/**
 * Test function - run this once after deploying to authorize the script
 */
function testEmail() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: WEBHOOK_SECRET,
        to: TEST_RECIPIENT,
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
        secret: WEBHOOK_SECRET,
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
 * Test the cancellation handler end-to-end: emails + Sheet row marked cancelled.
 */
function testCancellation() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: WEBHOOK_SECRET,
        type: 'cancellation',
        appointment_id: 'test-cancel-' + Math.floor(Date.now() / 1000),
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
 * Test the reminder handler end-to-end (customer + business email only; no Sheet).
 */
function testReminder() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: WEBHOOK_SECRET,
        type: 'reminder',
        appointment_id: 'test-reminder-' + Math.floor(Date.now() / 1000),
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
