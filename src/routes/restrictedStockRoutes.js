const express = require('express');
const router = express.Router();
const RestrictedStockController = require('../controllers/restrictedStockController');
const RestrictedStockChangelogController = require('../controllers/restrictedStockChangelogController');
const { validateRestrictedStock } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');

router.get('/', RestrictedStockController.getRestrictedStocks);
router.post('/', requireAuth, validateRestrictedStock, RestrictedStockController.addRestrictedStock);
router.delete('/:ticker', requireAuth, RestrictedStockController.removeRestrictedStock);

// Changelog routes
router.get('/changelog', RestrictedStockChangelogController.getChangelog);
router.get('/changelog/filtered', RestrictedStockChangelogController.getFilteredChangelog);
router.get('/changelog/export', RestrictedStockChangelogController.exportChangelog);

module.exports = router;