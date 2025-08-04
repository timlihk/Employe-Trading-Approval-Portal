# Microsoft 365 Azure Setup Guide

## Quick Setup Instructions

To get inspirationcap.com Microsoft 365 authentication working, you need to configure Azure Active Directory.

### Step 1: Get Your Tenant Information

**Option A: If you have admin access to Microsoft 365**
1. Go to [admin.microsoft.com](https://admin.microsoft.com)
2. Go to **Settings** → **Domains**
3. Look for your tenant ID in the URL or domain settings

**Option B: Use PowerShell (if available)**
```powershell
Connect-AzureAD
Get-AzureADTenantDetail | Select-Object ObjectId
```

**Option C: Check existing applications**
1. Go to [portal.azure.com](https://portal.azure.com)
2. Azure Active Directory → Overview
3. Copy the **Tenant ID**

### Step 2: Register Your Application

1. **Go to Azure Portal**: [portal.azure.com](https://portal.azure.com)
2. **Azure Active Directory** → **App registrations** → **New registration**
3. **Fill out**:
   - Name: `Trading Approval System`
   - Account types: `Accounts in this organizational directory only`
   - Redirect URI: `Web` → `http://localhost:3001/api/auth/microsoft/callback`

### Step 3: Get Your Credentials

After registration, copy these values:

1. **Application (client) ID** - from the Overview page
2. **Directory (tenant) ID** - from the Overview page  
3. **Client Secret** - Go to "Certificates & secrets" → "New client secret"

### Step 4: Set API Permissions

1. **API permissions** → **Add a permission**
2. **Microsoft Graph** → **Delegated permissions**
3. Add: `User.Read`, `email`, `profile`
4. **Grant admin consent**

### Step 5: Update Environment Variables

Create a `.env` file or update your existing one:

```bash
# Microsoft 365 OAuth Configuration
AZURE_CLIENT_ID=your-actual-client-id-here
AZURE_CLIENT_SECRET=your-actual-client-secret-here
AZURE_TENANT_ID=your-actual-tenant-id-here
REDIRECT_URI=http://localhost:3001/api/auth/microsoft/callback
```

### Step 6: Restart the Application

```bash
npm start
```

## Troubleshooting

### Error: "Specified tenant identifier is neither a valid DNS name"
- Your `AZURE_TENANT_ID` is still set to the placeholder value
- Replace it with your actual tenant ID from Azure Portal

### Error: "AADSTS700016: Application not found"
- Your `AZURE_CLIENT_ID` is incorrect
- Double-check the Application ID from Azure Portal

### Error: "AADSTS7000215: Invalid client secret"
- Your `AZURE_CLIENT_SECRET` is incorrect or expired
- Generate a new client secret in Azure Portal

### Error: "AADSTS50011: The reply URL specified in the request does not match"
- The redirect URI in Azure doesn't match your application
- Ensure it's exactly: `http://localhost:3001/api/auth/microsoft/callback`

## Need Help?

Contact your IT administrator or Azure AD admin for:
- Tenant ID information
- Permission to create app registrations
- Admin consent for API permissions