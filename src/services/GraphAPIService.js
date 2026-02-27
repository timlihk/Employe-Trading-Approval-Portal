const msal = require('@azure/msal-node');
const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

class GraphAPIService {
  static ccaInstance = null;
  static cachedSiteId = null;

  /**
   * Get or create a client-credentials MSAL instance.
   * This is separate from the user-level SSO flow in app.js.
   */
  static getClientCredentialApp() {
    if (!this.ccaInstance) {
      if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !process.env.AZURE_TENANT_ID) {
        throw new Error('Azure AD credentials not configured (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)');
      }
      this.ccaInstance = new msal.ConfidentialClientApplication({
        auth: {
          clientId: process.env.AZURE_CLIENT_ID,
          authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
          clientSecret: process.env.AZURE_CLIENT_SECRET
        }
      });
    }
    return this.ccaInstance;
  }

  /**
   * Acquire an app-level access token for Microsoft Graph.
   * MSAL caches tokens internally and refreshes on expiry.
   */
  static async getAccessToken() {
    const cca = this.getClientCredentialApp();
    const result = await cca.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });
    if (!result || !result.accessToken) {
      throw new Error('Failed to acquire Graph API access token');
    }
    return result.accessToken;
  }

  /**
   * Generic Graph API request helper with bearer token auth.
   */
  static async graphRequest(method, url, body = null, contentType = 'application/json') {
    const token = await this.getAccessToken();
    const fullUrl = url.startsWith('http') ? url : `${GRAPH_BASE}${url}`;

    const headers = {
      'Authorization': `Bearer ${token}`
    };
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const options = { method, headers };
    if (body !== null) {
      options.body = contentType === 'application/json' ? JSON.stringify(body) : body;
    }

    const response = await fetch(fullUrl, options);

    if (!response.ok) {
      let errorDetail;
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.error?.message || JSON.stringify(errorJson);
      } catch {
        errorDetail = response.statusText;
      }
      throw new Error(`Graph API ${method} ${url} failed (${response.status}): ${errorDetail}`);
    }

    // 204 No Content (e.g. sendMail) or 202 Accepted
    if (response.status === 204 || response.status === 202) {
      return { ok: true, status: response.status };
    }

    return await response.json();
  }

  /**
   * Fetch employees (Members only, not Guests) from Azure AD.
   * Filters by: userType=Member, accountEnabled=true, has assigned licenses (M365).
   * If AZURE_AD_EMPLOYEE_GROUP_ID is set, fetches group members instead (still filters guests).
   * Handles pagination via @odata.nextLink.
   */
  static async getEmployees() {
    const groupId = process.env.AZURE_AD_EMPLOYEE_GROUP_ID;
    let endpoint;

    if (groupId) {
      // Fetch members of a specific group — filter guests client-side since
      // /groups/{id}/members doesn't support $filter on userType
      endpoint = `${GRAPH_BASE}/groups/${groupId}/members?$select=displayName,mail,userPrincipalName,userType,assignedLicenses&$top=999`;
    } else {
      // Fetch all enabled Member users (excludes Guests at the API level)
      endpoint = `${GRAPH_BASE}/users?$filter=accountEnabled eq true and userType eq 'Member'&$select=displayName,mail,userPrincipalName,userType,assignedLicenses&$top=999`;
    }

    const employees = [];
    let guestsSkipped = 0;
    let unlicensedSkipped = 0;
    let nextLink = endpoint;

    while (nextLink) {
      const data = await this.graphRequest('GET', nextLink);
      for (const user of (data.value || [])) {
        // Skip guest users (relevant when fetching from a group)
        if (user.userType === 'Guest') {
          guestsSkipped++;
          continue;
        }

        // Skip users without any M365 license assigned
        if (!user.assignedLicenses || user.assignedLicenses.length === 0) {
          unlicensedSkipped++;
          continue;
        }

        const email = user.mail || user.userPrincipalName;
        if (email && email.includes('@')) {
          employees.push({
            email: email.toLowerCase(),
            name: user.displayName || email.split('@')[0]
          });
        }
      }
      nextLink = data['@odata.nextLink'] || null;
    }

    logger.info(`Fetched ${employees.length} employees from Azure AD (skipped ${guestsSkipped} guests, ${unlicensedSkipped} unlicensed)`);
    return employees;
  }

  /**
   * Send an email via Microsoft Graph API.
   * Requires Mail.Send application permission.
   * Uses the configured STATEMENT_SENDER_EMAIL as the sender mailbox.
   */
  static async sendEmail(to, subject, htmlBody) {
    const senderEmail = process.env.STATEMENT_SENDER_EMAIL;
    if (!senderEmail) {
      throw new Error('STATEMENT_SENDER_EMAIL not configured');
    }

    const payload = {
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: true
    };

    await this.graphRequest('POST', `/users/${senderEmail}/sendMail`, payload);
    logger.info(`Email sent to ${to}: "${subject}"`);
    return { sent: true, to };
  }

  /**
   * Resolve and cache the SharePoint site ID from the configured site URL.
   * SHAREPOINT_SITE_URL format: "yourcompany.sharepoint.com:/sites/SiteName"
   */
  static async getSharePointSiteId() {
    if (this.cachedSiteId) return this.cachedSiteId;

    const siteUrl = process.env.SHAREPOINT_SITE_URL;
    if (!siteUrl) {
      throw new Error('SHAREPOINT_SITE_URL not configured');
    }

    // Parse "hostname:/serverRelativePath" format
    const data = await this.graphRequest('GET', `/sites/${siteUrl}`);
    this.cachedSiteId = data.id;
    logger.info(`Resolved SharePoint site ID: ${data.id}`);
    return data.id;
  }

  /**
   * Get the default document library drive ID for the configured SharePoint site.
   */
  static async getSharePointDriveId() {
    const siteId = await this.getSharePointSiteId();
    const libraryName = process.env.SHAREPOINT_LIBRARY_NAME || 'Documents';

    const data = await this.graphRequest('GET', `/sites/${siteId}/drives`);
    const drives = data.value || [];

    // Try exact match, then case-insensitive, then partial match on name or webUrl
    let drive = drives.find(d => d.name === libraryName);
    if (!drive) {
      const lower = libraryName.toLowerCase();
      drive = drives.find(d => d.name && d.name.toLowerCase() === lower);
    }
    if (!drive) {
      const lower = libraryName.toLowerCase();
      drive = drives.find(d => (d.webUrl && d.webUrl.toLowerCase().includes(lower)));
    }
    // "Shared Documents" is the URL path for the default "Documents" library
    if (!drive && (libraryName === 'Shared Documents' || libraryName === 'Documents')) {
      drive = drives.find(d => d.name === 'Documents' || (d.webUrl && d.webUrl.includes('Shared%20Documents')));
    }

    if (!drive) {
      const available = drives.map(d => d.name).join(', ');
      throw new Error(`SharePoint document library "${libraryName}" not found. Available: ${available}`);
    }
    return drive.id;
  }

  /**
   * Ensure a folder exists in SharePoint, creating it if necessary.
   * Creates nested folders one level at a time.
   */
  static async ensureSharePointFolder(folderPath) {
    const driveId = await this.getSharePointDriveId();
    const parts = folderPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      try {
        await this.graphRequest('GET', `/drives/${driveId}/root:/${currentPath}`);
      } catch {
        // Folder doesn't exist, create it
        const parentPath = currentPath.includes('/')
          ? `/drives/${driveId}/root:/${currentPath.substring(0, currentPath.lastIndexOf('/'))}:/children`
          : `/drives/${driveId}/root/children`;

        await this.graphRequest('POST', parentPath, {
          name: part,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
        });
        logger.info(`Created SharePoint folder: ${currentPath}`);
      }
    }

    return currentPath;
  }

  /**
   * Upload a file to SharePoint document library.
   * Uses simple PUT for files <4MB, upload session for larger files.
   */
  static async uploadToSharePoint(fileBuffer, filename, folderPath) {
    const driveId = await this.getSharePointDriveId();

    // Sanitize filename — keep extension, replace unsafe characters
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = `${folderPath}/${safeFilename}`;

    // Ensure the target folder exists
    await this.ensureSharePointFolder(folderPath);

    if (fileBuffer.length < 4 * 1024 * 1024) {
      // Simple upload for files under 4MB
      const data = await this.graphRequest(
        'PUT',
        `/drives/${driveId}/root:/${fullPath}:/content`,
        fileBuffer,
        'application/octet-stream'
      );
      logger.info(`Uploaded to SharePoint: ${fullPath} (${fileBuffer.length} bytes)`);
      return { itemId: data.id, webUrl: data.webUrl, name: data.name };
    }

    // Upload session for larger files
    const session = await this.graphRequest(
      'POST',
      `/drives/${driveId}/root:/${fullPath}:/createUploadSession`,
      {
        item: {
          '@microsoft.graph.conflictBehavior': 'rename',
          name: safeFilename
        }
      }
    );

    const uploadUrl = session.uploadUrl;
    const chunkSize = 320 * 1024; // 320KB chunks
    let offset = 0;
    let result;

    while (offset < fileBuffer.length) {
      const end = Math.min(offset + chunkSize, fileBuffer.length);
      const chunk = fileBuffer.slice(offset, end);

      const token = await this.getAccessToken();
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${offset}-${end - 1}/${fileBuffer.length}`,
          'Content-Length': chunk.length,
          'Authorization': `Bearer ${token}`
        },
        body: chunk
      });

      result = await response.json();
      offset = end;
    }

    logger.info(`Uploaded to SharePoint (chunked): ${fullPath} (${fileBuffer.length} bytes)`);
    return { itemId: result.id, webUrl: result.webUrl, name: result.name };
  }

  /**
   * Test SharePoint connectivity by resolving site ID and drive ID.
   * Returns diagnostic info or throws with a descriptive error.
   */
  static async testSharePointConnection() {
    const results = { steps: [] };

    // Step 1: Check env vars
    const siteUrl = process.env.SHAREPOINT_SITE_URL;
    const libraryName = process.env.SHAREPOINT_LIBRARY_NAME || 'Documents';
    if (!siteUrl) {
      results.steps.push({ step: 'Config', status: 'fail', detail: 'SHAREPOINT_SITE_URL not set' });
      return results;
    }
    results.steps.push({ step: 'Config', status: 'ok', detail: `Site: ${siteUrl}, Library: ${libraryName}` });

    // Step 2: Acquire token
    try {
      await this.getAccessToken();
      results.steps.push({ step: 'Auth', status: 'ok', detail: 'Access token acquired' });
    } catch (error) {
      results.steps.push({ step: 'Auth', status: 'fail', detail: error.message });
      return results;
    }

    // Step 3: Resolve site
    try {
      const siteId = await this.getSharePointSiteId();
      results.steps.push({ step: 'Site', status: 'ok', detail: `Site ID: ${siteId.substring(0, 40)}...` });
    } catch (error) {
      results.steps.push({ step: 'Site', status: 'fail', detail: error.message });
      return results;
    }

    // Step 4: Resolve drive
    try {
      const driveId = await this.getSharePointDriveId();
      results.steps.push({ step: 'Drive', status: 'ok', detail: `Drive ID: ${driveId.substring(0, 40)}...` });
    } catch (error) {
      results.steps.push({ step: 'Drive', status: 'fail', detail: error.message });
      return results;
    }

    // Step 5: Test folder access
    try {
      const folderPath = process.env.SHAREPOINT_FOLDER_PATH || 'Trading Statements';
      await this.ensureSharePointFolder(folderPath);
      results.steps.push({ step: 'Folder', status: 'ok', detail: `Folder "${folderPath}" accessible` });
    } catch (error) {
      results.steps.push({ step: 'Folder', status: 'fail', detail: error.message });
      return results;
    }

    return results;
  }
}

module.exports = GraphAPIService;
