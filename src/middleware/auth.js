const bcrypt = require('bcryptjs');
const AuditLog = require('../models/AuditLog');

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123'
};

const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      requiresLogin: true
    });
  }
};

const authenticate = async (username, password) => {
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    return true;
  }
  return false;
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const isValid = await authenticate(username, password);

    if (isValid) {
      req.session.authenticated = true;
      req.session.username = username;
      req.session.adminLoggedIn = true;

      // Log successful admin login
      await AuditLog.logActivity(
        username,
        'admin',
        'admin_login_success',
        'authentication',
        null,
        JSON.stringify({ username, session_id: req.sessionID }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );

      res.json({
        success: true,
        message: 'Login successful'
      });
    } else {
      // Log failed admin login attempt
      await AuditLog.logActivity(
        username,
        'admin',
        'admin_login_failed',
        'authentication',
        null,
        JSON.stringify({ username, reason: 'invalid_credentials' }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );

      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const logout = async (req, res) => {
  try {
    const username = req.session.username || 'unknown';
    const sessionId = req.sessionID;

    // Log admin logout
    await AuditLog.logActivity(
      username,
      'admin',
      'admin_logout',
      'authentication',
      null,
      JSON.stringify({ username, session_id: sessionId }),
      req.ip,
      req.get('User-Agent'),
      sessionId
    );

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Could not log out'
        });
      }
      res.json({
        success: true,
        message: 'Logout successful'
      });
    });
  } catch (error) {
    console.error('Logout error:', error);
    req.session.destroy((err) => {
      res.json({
        success: true,
        message: 'Logout successful'
      });
    });
  }
};

const checkAuth = (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({
      success: true,
      authenticated: true,
      username: req.session.username
    });
  } else {
    res.json({
      success: true,
      authenticated: false
    });
  }
};

module.exports = {
  requireAuth,
  login,
  logout,
  checkAuth
};