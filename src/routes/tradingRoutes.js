const express = require('express');
const router = express.Router();
const TradingController = require('../controllers/tradingController');
const { validateTradingRequest } = require('../middleware/validation');
const { requireEmployeeAuth } = require('../middleware/employeeAuth');

router.post('/submit', requireEmployeeAuth, validateTradingRequest, TradingController.submitRequest);
router.get('/requests', TradingController.getRequests);
router.get('/requests/:id', TradingController.getRequest);

module.exports = router;