const express = require('express');
const router = express.Router();
const InquiryController = require('../controllers/inquiryController');
const { requireAuth } = require('../middleware/auth');

// All inquiry routes require admin authentication
router.get('/team-members', requireAuth, InquiryController.getTeamMembers);
router.get('/submission-history', requireAuth, InquiryController.getSubmissionHistory);

module.exports = router;