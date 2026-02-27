#!/usr/bin/env node
/**
 * Send announcement email to all employees via Graph API.
 *
 * Usage:
 *   node scripts/send-announcement.js --dry-run    # Preview recipients only
 *   node scripts/send-announcement.js              # Send to all employees
 *
 * Requires env vars: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, STATEMENT_SENDER_EMAIL
 */

const GraphAPIService = require('../src/services/GraphAPIService');

const dryRun = process.argv.includes('--dry-run');

const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #333;">
  <div style="background: #1a237e; color: white; padding: 20px; text-align: center;">
    <h2 style="margin: 0;">Revamped Employee Pre-Trade Approval Portal</h2>
    <p style="margin: 8px 0 0; opacity: 0.9;">New Website &amp; Features</p>
  </div>

  <div style="padding: 24px; border: 1px solid #e0e0e0; border-top: none;">
    <p>Dear Team,</p>

    <p>We are pleased to announce that our <strong>Employee Pre-Trade Approval Portal</strong> has been revamped with a new website and additional features to streamline our compliance processes.</p>

    <p style="text-align: center; margin: 24px 0;">
      <a href="https://pa-approval.inspirationcap.com"
         style="background: #1a237e; color: white; padding: 14px 28px;
                text-decoration: none; border-radius: 4px; font-weight: bold;
                display: inline-block;">
        Visit the New Portal
      </a>
    </p>

    <p style="text-align: center; color: #666; font-size: 13px;">
      <strong>Please bookmark:</strong> https://pa-approval.inspirationcap.com
    </p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">

    <h3 style="color: #1a237e; margin-top: 0;">What's New</h3>

    <p><strong>New Brokerage Account Registry</strong></p>
    <ul>
      <li>Register your brokerage accounts (firm name + account number) in the portal</li>
      <li>First-time users will be prompted to set up their accounts upon login — this takes about 2 minutes</li>
      <li>Every 30 days, you will be asked to confirm your accounts are still current (one-click confirmation)</li>
    </ul>

    <p><strong>Monthly Statement Uploads</strong></p>
    <ul>
      <li>You will receive a monthly email requesting your brokerage account statements</li>
      <li>Upload directly through the portal or via the secure link in the email</li>
      <li>Supported formats: PDF, PNG, JPG, CSV, XLSX (max 10 MB)</li>
      <li>All statements are <strong>stored securely in SharePoint</strong> and are only accessible to the COO and the Compliance team</li>
    </ul>

    <p><strong>30-Day Holding Period Enforcement</strong></p>
    <ul>
      <li>Trades on the same instrument in the opposite direction within 30 days will be automatically flagged for compliance review, in line with SFC FMCC requirements</li>
    </ul>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">

    <h3 style="color: #1a237e; margin-top: 0;">What You Need To Do Now</h3>

    <ol>
      <li>Visit <a href="https://pa-approval.inspirationcap.com">pa-approval.inspirationcap.com</a> and <strong>bookmark</strong> it</li>
      <li>Log in with your Microsoft 365 credentials</li>
      <li>Register your brokerage account(s) when prompted</li>
      <li>Confirm your accounts</li>
    </ol>

    <p>As a reminder, please submit all personal trading requests through the portal <strong>before</strong> executing any trades.</p>

    <p>If you have any questions, please reach out to the Compliance team.</p>

    <p>Best regards,<br><strong>Compliance</strong></p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
    <p style="color: #888; font-size: 12px;">
      Employee Trading Compliance Portal<br>
      This is an automated message. Please do not reply to this email.
    </p>
  </div>
</div>
`;

const subject = 'Revamped Employee Pre-Trade Approval Portal — New Website & Features';

async function main() {
  console.log('Fetching employees from Azure AD...');
  const employees = await GraphAPIService.getEmployees();
  console.log(`Found ${employees.length} employees\n`);

  if (dryRun) {
    console.log('=== DRY RUN — No emails will be sent ===\n');
    for (const emp of employees) {
      console.log(`  ${emp.name} <${emp.email}>`);
    }
    console.log(`\nTotal: ${employees.length} recipients`);
    console.log('Run without --dry-run to send.');
    return;
  }

  console.log(`Sending announcement to ${employees.length} employees...`);
  let sent = 0;
  let failed = 0;

  for (const emp of employees) {
    try {
      await GraphAPIService.sendEmail(emp.email, subject, htmlBody);
      console.log(`  ✓ ${emp.name} <${emp.email}>`);
      sent++;
      // Small delay between emails
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`  ✗ ${emp.name} <${emp.email}>: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${sent} sent, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
