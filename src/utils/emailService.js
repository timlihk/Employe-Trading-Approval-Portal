const nodemailer = require('nodemailer');
const ComplianceSettings = require('../models/ComplianceSettings');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER || 'your-email@company.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
      }
    });
  }

  async sendApprovalEmail(employeeEmail, requestData, status, rejectionReason = null) {
    // Check if email notifications are enabled
    const isEmailEnabled = await ComplianceSettings.isEmailNotificationEnabled();
    if (!isEmailEnabled) {
      console.log('Email notifications are disabled. Skipping email to:', employeeEmail);
      return { success: true, message: 'Email notifications disabled' };
    }
    const subject = `Trading Request ${status.toUpperCase()} - ${requestData.ticker}`;
    
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${status === 'approved' ? '#28a745' : '#dc3545'};">
          Trading Request ${status.toUpperCase()}
        </h2>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3>Request Details:</h3>
          <p><strong>Stock:</strong> ${requestData.stock_name} (${requestData.ticker})</p>
          <p><strong>Action:</strong> ${requestData.trading_type.toUpperCase()}</p>
          <p><strong>Shares:</strong> ${requestData.shares.toLocaleString()}</p>
          ${requestData.share_price ? `<p><strong>Share Price:</strong> ${requestData.share_price.toFixed(2)} ${requestData.currency || 'USD'}</p>` : ''}
          ${requestData.total_value ? `<p><strong>Total Value:</strong> ${requestData.total_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${requestData.currency || 'USD'}</p>` : ''}
          ${requestData.total_value_usd && requestData.currency !== 'USD' ? `<p><strong>USD Equivalent:</strong> $${requestData.total_value_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>` : ''}
          <p><strong>Status:</strong> ${status.toUpperCase()}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>
    `;

    if (status === 'approved') {
      htmlContent += `
        <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; border-left: 4px solid #28a745;">
          <p style="color: #155724; margin: 0;">
            <strong>✅ Your trading request has been approved!</strong><br>
            You may proceed with this ${requestData.trading_type} transaction for ${requestData.shares.toLocaleString()} shares of ${requestData.ticker}.
            ${requestData.total_value_usd ? `<br><br><em>Trade value: $${requestData.total_value_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</em>` : ''}
          </p>
        </div>
      `;
    } else {
      htmlContent += `
        <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; border-left: 4px solid #dc3545;">
          <p style="color: #721c24; margin: 0;">
            <strong>❌ Your trading request has been rejected.</strong><br>
            <strong>Reason:</strong> ${rejectionReason || 'Stock is on the restricted trading list.'}<br><br>
            <em>Please contact compliance@company.com if you have questions about this decision.</em>
          </p>
        </div>
      `;
    }

    htmlContent += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px;">
          <p><strong>Important:</strong> This is an automated message from the Trading Compliance System.</p>
          <p>• Keep this email for your records</p>
          <p>• All trades must be executed within company policy guidelines</p>
          <p>• Questions? Contact compliance@company.com or visit the internal trading portal</p>
          <p style="margin-top: 15px;"><em>Request ID: #${requestData.id || 'N/A'} | Generated: ${new Date().toISOString()}</em></p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'compliance@company.com',
      to: employeeEmail,
      subject: subject,
      html: htmlContent
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();