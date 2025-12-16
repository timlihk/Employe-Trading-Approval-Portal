/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/AdminController');
const EmployeeController = require('../controllers/EmployeeController');
const { authLimiter, validateAdminAuth, verifyCsrfToken } = require('../middleware/security');

// Employee OAuth login route
if (process.env.OAUTH_CLIENT_ID) {
  router.get('/auth/microsoft/login', async (req, res) => {
    // ... implementation
  });

  router.get('/auth/microsoft/callback', async (req, res) => {
    // ... implementation
  });

  router.get('/auth/microsoft/logout', (req, res) => {
    // ... implementation
  });
}

// Dummy authentication routes (development)
router.get('/employee-dummy-login', EmployeeController.getDummyLogin);
router.post('/employee-dummy-authenticate', verifyCsrfToken, EmployeeController.authenticateDummy);

// Logout routes
router.get('/employee-logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/employee-login?success=' + encodeURIComponent('You have been logged out'));
  });
});

router.get('/admin-logout', (req, res) => {
  delete req.session.adminUser;
  res.redirect('/admin-login?success=' + encodeURIComponent('You have been logged out'));
});

// Admin authentication
router.post('/admin-authenticate', authLimiter, validateAdminAuth, verifyCsrfToken, AdminController.authenticateAdmin);

module.exports = router;
