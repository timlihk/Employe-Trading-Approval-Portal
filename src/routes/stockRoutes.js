const express = require('express');
const router = express.Router();
const stockService = require('../services/stockService');
const database = require('../models/database');

// Get stock information by ticker - handle tickers with dots
router.get('/info/:ticker', async (req, res) => {
    try {
        let { ticker } = req.params;
        
        // Decode URL-encoded ticker (handles dots, special characters)
        ticker = decodeURIComponent(ticker);
        
        if (!ticker || ticker.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Ticker symbol is required'
            });
        }

        const stockInfo = await stockService.getStockInfo(ticker);
        
        if (!stockInfo.success) {
            return res.status(404).json(stockInfo);
        }

        res.json(stockInfo);
    } catch (error) {
        console.error('Error fetching stock info:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error while fetching stock information'
        });
    }
});

// Calculate trade value
router.post('/calculate', async (req, res) => {
    try {
        const { ticker, shares } = req.body;
        
        if (!ticker || !shares) {
            return res.status(400).json({
                success: false,
                error: 'Ticker and shares are required'
            });
        }

        // Get max trade amount from compliance settings
        let maxTradeAmount = null;
        try {
            const db = database.getDb();
            const setting = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT setting_value FROM compliance_settings WHERE setting_key = ?',
                    ['max_trade_amount'],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (setting && setting.setting_value) {
                maxTradeAmount = parseFloat(setting.setting_value);
            }
        } catch (dbError) {
            console.warn('Could not fetch max trade amount from settings:', dbError.message);
        }

        const calculation = await stockService.calculateTradeValue(ticker, shares, maxTradeAmount);
        
        if (!calculation.success) {
            return res.status(400).json(calculation);
        }

        res.json(calculation);
    } catch (error) {
        console.error('Error calculating trade value:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error while calculating trade value'
        });
    }
});

// Validate ticker
router.get('/validate/:ticker', async (req, res) => {
    try {
        let { ticker } = req.params;
        
        // Decode URL-encoded ticker (handles dots, special characters)
        ticker = decodeURIComponent(ticker);
        
        if (!ticker || ticker.length === 0) {
            return res.status(400).json({
                valid: false,
                error: 'Ticker symbol is required'
            });
        }

        const validation = await stockService.validateTicker(ticker);
        res.json(validation);
    } catch (error) {
        console.error('Error validating ticker:', error);
        res.status(500).json({
            valid: false,
            error: 'Internal server error while validating ticker'
        });
    }
});

module.exports = router;