/**
 * System Routes - Health checks, metrics, and system status
 */

const express = require('express');
const router = express.Router();
const database = require('../models/database');
const { metrics } = require('../utils/metrics');
const { version } = require('../../package.json');

/**
 * @route GET /health
 * @description Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    let dbStatus = 'unknown';
    let dbError = null;

    try {
      if (process.env.DATABASE_URL) {
        try {
          await database.query('SELECT 1 as test');
          dbStatus = 'connected';
        } catch (e) {
          dbStatus = 'error';
          dbError = e.message;
        }
      } else {
        dbStatus = 'no_url_provided';
      }
    } catch (error) {
      dbStatus = 'error';
      dbError = error.message;
    }

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version,
      database: {
        status: dbStatus,
        error: dbError,
        hasUrl: !!process.env.DATABASE_URL
      }
    });
  } catch (error) {
    metrics.errors += 1;
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version,
      database: {
        status: 'healthcheck_error',
        error: error.message
      }
    });
  }
});

/**
 * @route GET /metrics
 * @description Application metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  try {
    const dbMetrics = await database.getMetrics();
    const metricsData = {
      database: dbMetrics,
      cache: {
        tickerValidations: metrics.cacheStats.tickerValidations,
        hits: metrics.cacheHits,
        misses: metrics.cacheMisses
      },
      externalApi: {
        yahooFinanceCalls: metrics.externalApiCalls.yahooFinance,
        exchangeRateCalls: metrics.externalApiCalls.exchangeRate
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    res.json(metricsData);
  } catch (error) {
    logger.error('Error fetching metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * @route GET /db-status
 * @description Database status (admin only)
 */
router.get('/db-status', requireAdmin, async (req, res) => {
  try {
    let dbInfo = { connected: false, error: null };

    try {
      if (database.getPool()) {
        const result = await database.query(`
          SELECT
            count(*) as connection_count,
            state
          FROM pg_stat_activity
          WHERE datname = current_database()
          GROUP BY state
        `);

        const totalConnections = result.rows.reduce((sum, row) => sum + parseInt(row.connection_count), 0);
        const activeConnections = result.rows.find(r => r.state === 'active')?.connection_count || 0;
        const idleConnections = result.rows.find(r => r.state === 'idle')?.connection_count || 0;

        dbInfo = {
          connected: true,
          total_connections: totalConnections,
          active_connections: activeConnections,
          idle_connections: idleConnections,
          pool_max: database.getPool().options?.max || 'N/A'
        };
      }
    } catch (error) {
      dbInfo = { connected: false, error: error.message };
    }

    res.render('admin/db-status', {
      title: 'Database Status',
      dbInfo,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    logger.error('Error rendering DB status', { error: error.message });
    res.redirect('/admin-dashboard?error=' + encodeURIComponent('Unable to check database status'));
  }
});

module.exports = router;
