require('dotenv').config();

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (process.env.NODE_ENV === 'development') {
          console.log(message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 3, // Info
    }
  }
};

const REDIRECT_URI = process.env.NODE_ENV === 'production' 
  ? process.env.REDIRECT_URI 
  : 'http://localhost:3001/api/auth/microsoft/callback';

const POST_LOGOUT_REDIRECT_URI = process.env.NODE_ENV === 'production'
  ? process.env.POST_LOGOUT_REDIRECT_URI
  : 'http://localhost:3001';

module.exports = {
  msalConfig,
  REDIRECT_URI,
  POST_LOGOUT_REDIRECT_URI
};