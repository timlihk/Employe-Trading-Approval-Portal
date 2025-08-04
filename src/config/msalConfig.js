const { ConfidentialClientApplication } = require('@azure/msal-node');

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID || 'your-client-id',
        clientSecret: process.env.AZURE_CLIENT_SECRET || 'your-client-secret',
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'your-tenant-id'}`
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                if (process.env.NODE_ENV === 'development') {
                    console.log(message);
                }
            },
            piiLoggingEnabled: false,
            logLevel: 'Info',
        }
    }
};

const msalInstance = new ConfidentialClientApplication(msalConfig);

const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback';
const POST_LOGOUT_REDIRECT_URI = process.env.POST_LOGOUT_REDIRECT_URI || 'http://localhost:3001';

const authCodeUrlParameters = {
    scopes: ['user.read', 'email', 'profile'],
    redirectUri: REDIRECT_URI,
};

const tokenRequest = {
    scopes: ['user.read', 'email', 'profile'],
    redirectUri: REDIRECT_URI,
};

module.exports = {
    msalInstance,
    REDIRECT_URI,
    POST_LOGOUT_REDIRECT_URI,
    authCodeUrlParameters,
    tokenRequest
};