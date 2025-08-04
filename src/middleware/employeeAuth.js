const { msalInstance, authCodeUrlParameters, tokenRequest } = require('../config/msalConfig');
const AuditLog = require('../models/AuditLog');

const requireEmployeeAuth = (req, res, next) => {
    // Check if Azure is properly configured
    const azureConfigured = process.env.AZURE_CLIENT_ID && 
                           process.env.AZURE_CLIENT_SECRET && 
                           process.env.AZURE_TENANT_ID &&
                           process.env.AZURE_CLIENT_ID !== 'your-azure-client-id' &&
                           process.env.AZURE_CLIENT_SECRET !== 'your-azure-client-secret' &&
                           process.env.AZURE_TENANT_ID !== 'your-azure-tenant-id';

    if (!azureConfigured) {
        return res.status(503).json({
            success: false,
            message: 'Microsoft 365 authentication is not configured. Please contact your administrator.',
            configurationRequired: true
        });
    }

    if (req.session && req.session.employeeAuthenticated && req.session.employeeEmail) {
        // Check if email is from inspirationcap.com domain
        if (req.session.employeeEmail.endsWith('@inspirationcap.com')) {
            return next();
        } else {
            return res.status(403).json({
                success: false,
                message: 'Access restricted to inspirationcap.com email addresses only',
                requiresLogin: true
            });
        }
    } else {
        return res.status(401).json({
            success: false,
            message: 'Employee authentication required',
            requiresLogin: true
        });
    }
};

const initiateMicrosoftLogin = async (req, res) => {
    try {
        // Check if Azure is properly configured
        const azureConfigured = process.env.AZURE_CLIENT_ID && 
                               process.env.AZURE_CLIENT_SECRET && 
                               process.env.AZURE_TENANT_ID &&
                               process.env.AZURE_CLIENT_ID !== 'your-azure-client-id' &&
                               process.env.AZURE_CLIENT_SECRET !== 'your-azure-client-secret' &&
                               process.env.AZURE_TENANT_ID !== 'your-azure-tenant-id';

        if (!azureConfigured) {
            return res.status(503).json({
                success: false,
                message: 'Microsoft 365 authentication is not configured. Please set up Azure credentials in environment variables.',
                configurationRequired: true
            });
        }

        // Generate a unique state parameter for CSRF protection
        const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        req.session.authState = state;

        const authCodeUrlParameters = {
            scopes: ['user.read', 'email', 'profile'],
            redirectUri: process.env.REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback',
            state: state,
            prompt: 'select_account' // Force account selection
        };

        const authUrl = await msalInstance.getAuthCodeUrl(authCodeUrlParameters);
        
        res.json({
            success: true,
            authUrl: authUrl
        });
    } catch (error) {
        console.error('Error initiating Microsoft login:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate Microsoft login'
        });
    }
};

const handleMicrosoftCallback = async (req, res) => {
    try {
        const { code, state, error } = req.query;

        // Verify state parameter to prevent CSRF attacks
        if (state !== req.session.authState) {
            return res.status(400).json({
                success: false,
                message: 'Invalid state parameter'
            });
        }

        if (error) {
            console.error('Microsoft OAuth error:', error);
            return res.status(400).json({
                success: false,
                message: 'Microsoft authentication failed: ' + error
            });
        }

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'No authorization code received'
            });
        }

        const tokenRequest = {
            code: code,
            scopes: ['user.read', 'email', 'profile'],
            redirectUri: process.env.REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback',
        };

        const response = await msalInstance.acquireTokenByCode(tokenRequest);
        
        // Validate that the user is from inspirationcap.com domain
        const userEmail = response.account.username.toLowerCase();
        if (!userEmail.endsWith('@inspirationcap.com')) {
            return res.status(403).json({
                success: false,
                message: 'Access restricted to inspirationcap.com email addresses only'
            });
        }

        // Store user information in session
        req.session.employeeAuthenticated = true;
        req.session.employeeEmail = userEmail;
        req.session.employeeName = response.account.name;
        req.session.accessToken = response.accessToken;

        // Log successful employee login
        await AuditLog.logActivity(
            userEmail,
            'employee',
            'employee_login_success',
            'authentication',
            null,
            JSON.stringify({ 
                email: userEmail, 
                name: response.account.name,
                session_id: req.sessionID 
            }),
            req.ip,
            req.get('User-Agent'),
            req.sessionID
        );

        // Clean up the auth state
        delete req.session.authState;

        // Redirect to the main application with employee tab active
        res.redirect('/?login=success&tab=employee');
        
    } catch (error) {
        console.error('Error handling Microsoft callback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process Microsoft authentication'
        });
    }
};

const employeeLogout = async (req, res) => {
    try {
        const userEmail = req.session.employeeEmail || 'unknown';
        const sessionId = req.sessionID;

        // Log employee logout
        await AuditLog.logActivity(
            userEmail,
            'employee',
            'employee_logout',
            'authentication',
            null,
            JSON.stringify({ 
                email: userEmail,
                session_id: sessionId 
            }),
            req.ip,
            req.get('User-Agent'),
            sessionId
        );

        // Clear employee session data
        delete req.session.employeeAuthenticated;
        delete req.session.employeeEmail;
        delete req.session.employeeName;
        delete req.session.accessToken;

        res.json({
            success: true,
            message: 'Employee logout successful'
        });
    } catch (error) {
        console.error('Employee logout error:', error);
        // Still clear session data even if audit logging fails
        delete req.session.employeeAuthenticated;
        delete req.session.employeeEmail;
        delete req.session.employeeName;
        delete req.session.accessToken;

        res.json({
            success: true,
            message: 'Employee logout successful'
        });
    }
};

const checkEmployeeAuth = (req, res) => {
    if (req.session && req.session.employeeAuthenticated && req.session.employeeEmail) {
        res.json({
            success: true,
            authenticated: true,
            email: req.session.employeeEmail,
            name: req.session.employeeName
        });
    } else {
        res.json({
            success: true,
            authenticated: false
        });
    }
};

module.exports = {
    requireEmployeeAuth,
    initiateMicrosoftLogin,
    handleMicrosoftCallback,
    employeeLogout,
    checkEmployeeAuth
};