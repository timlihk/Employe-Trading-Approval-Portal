const express = require('express');
const router = express.Router();
const { 
    initiateMicrosoftLogin, 
    handleMicrosoftCallback, 
    employeeLogout, 
    checkEmployeeAuth 
} = require('../middleware/employeeAuth');

// Initiate Microsoft 365 login
router.get('/microsoft/login', initiateMicrosoftLogin);

// Handle Microsoft 365 callback
router.get('/microsoft/callback', handleMicrosoftCallback);

// Employee logout
router.post('/employee/logout', employeeLogout);

// Check employee authentication status
router.get('/employee/check', checkEmployeeAuth);

module.exports = router;