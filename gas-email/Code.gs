/**
 * Google Apps Script - Email Sender for Chatbot Appointments
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com
 * 2. Click "New Project"
 * 3. Paste this entire code
 * 4. Click "Deploy" → "New Deployment"
 * 5. Type: "Web App"
 * 6. Execute as: "Me"
 * 7. Who has access: "Anyone"
 * 8. Click "Deploy"
 * 9. Copy the Web App URL (ends with /exec)
 * 10. Add to GitHub Secrets as GAS_WEBAPP_URL
 * 11. Run testEmail() once to authorize
 *
 * IMPORTANT: Replace TEST_RECIPIENT below with YOUR real email address
 * before running testEmail(). Session.getActiveUser().getEmail() returns
 * null in standalone scripts, which breaks the test.
 */

/**
 * Your real receiving address for test emails. CHANGE THIS.
 */
var TEST_RECIPIENT = 'you@gmail.com';

function doPost(e) {
  try {
    // Parse incoming JSON
    const data = JSON.parse(e.postData.contents);
    const { to, subject, html } = data;

    // Validate required fields
    if (!to || !subject || !html) {
      return ContentService
        .createTextOutput(JSON.stringify({ 
          error: 'Missing required fields: to, subject, html' 
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Send email via MailApp (works with any Google account; shares the
    // Gmail sending quota — see checkQuota() below)
    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: html,
      name: 'Chatbot Appointments'
    });

    // Return success
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: true, 
        messageId: 'sent' 
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Return error
    return ContentService
      .createTextOutput(JSON.stringify({ 
        error: error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
 * Check daily quota
 */
function checkQuota() {
  const quota = MailApp.getRemainingDailyQuota();
  Logger.log(`Remaining emails today: ${quota}`);
  return quota;
}