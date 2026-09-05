/**
 * Google Apps Script - Per-Tenant Booking Notifications for the Chatbot
 *
 * Runs in the TENANT's Google account, so it has access to their Gmail and
 * Google Sheets. The Worker calls each tenant's /exec URL with a `type:
 * 'booking'` payload after an appointment is created; this script:
 *
 *   1. Emails the customer a confirmation.
 *   2. Emails the business (notification_email) a booking alert.
 *   3. Appends a row to the tenant's appointments Google Sheet.
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
    // Parse incoming JSON
    const data = JSON.parse(e.postData.contents);

    if (!data.type) {
      // Legacy/back-compat: plain email payload {to, subject, html}
      return handleEmail(data);
    }

    if (data.type === 'booking') {
      return handleBooking(data);
    }

    if (data.type === 'email') {
      return handleEmail(data);
    }

    return replyError('Unknown request type: ' + data.type);
  } catch (error) {
    return replyError(error.toString());
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
    tenant_name,
    customer_name,
    customer_email,
    start_time,
    end_time,
    title,
    notification_email,
    spreadsheet_id
  } = data;

  const when = new Date(start_time * 1000).toLocaleString();
  const until = new Date(end_time * 1000).toLocaleTimeString();
  const tenantLabel = tenant_name || 'the business';
  const customerLabel = customer_name || 'there';

  // 1. Customer confirmation
  if (customer_email) {
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
  }

  // 2. Business notification
  if (notification_email) {
    MailApp.sendEmail({
      to: notification_email,
      subject: 'New booking: ' + (customer_name || customer_email || 'a customer'),
      htmlBody:
        '<p>A new appointment was just booked:</p>' +
        '<ul>' +
        '<li><strong>' + (title || 'Appointment') + '</strong></li>' +
        '<li>' + when + ' – ' + until + '</li>' +
        '<li>Customer: ' + (customer_name || '—') + ' (' + (customer_email || '—') + ')</li>' +
        '</ul>'
    });
  }

  // 3. Append to the appointments Google Sheet
  const sheetId = spreadsheet_id || SPREADSHEET_ID;
  if (sheetId) {
    try {
      const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
      sheet.appendRow([
        new Date(start_time * 1000),
        new Date(end_time * 1000),
        title || 'Appointment',
        customer_name || '',
        customer_email || '',
        'confirmed'
      ]);
    } catch (sheetError) {
      // Sheet logging is best-effort; emails still succeeded.
      return replySuccess({ note: 'emails sent; sheet append failed: ' + sheetError.toString() });
    }
  }

  return replySuccess();
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
        type: 'booking',
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