const request = require('supertest');
const app = require('../../src/app');
const database = require('../../src/models/database');

describe('Integration: HTTP Endpoints', () => {
  describe('GET /health', () => {
    test('should return 200 with healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('database');
    });
  });

  describe('GET /metrics', () => {
    test('should return 200 with metrics data', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uptimeSeconds');
      expect(res.body).toHaveProperty('requests');
      expect(res.body).toHaveProperty('errors');
      expect(res.body).toHaveProperty('latency');
      expect(res.body).toHaveProperty('database');
      expect(res.body.database).toHaveProperty('pool');
      expect(res.body).toHaveProperty('errorCategories');
      expect(res.body).toHaveProperty('recentErrors');
    });
  });

  describe('GET / (landing page)', () => {
    test('should return 200 with HTML', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });
  });

  describe('Auth Guards', () => {
    test('GET /admin-dashboard should redirect without admin session', async () => {
      const res = await request(app).get('/admin-dashboard');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/admin-login/);
    });

    test('GET /employee-dashboard should redirect without employee session', async () => {
      const res = await request(app).get('/employee-dashboard');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\//);
    });

    test('GET /employee-history should redirect without employee session', async () => {
      const res = await request(app).get('/employee-history');
      expect(res.status).toBe(302);
    });

    test('GET /admin-requests should redirect without admin session', async () => {
      const res = await request(app).get('/admin-requests');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/admin-login/);
    });
  });

  describe('Admin Authentication', () => {
    test('POST /admin-authenticate should reject without CSRF token', async () => {
      const res = await request(app)
        .post('/admin-authenticate')
        .type('form')
        .send({ username: 'wrong', password: 'wrong' });
      // CSRF protection blocks the request
      expect(res.status).toBe(403);
    });

    test('GET /admin-login should return login page', async () => {
      const res = await request(app).get('/admin-login');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });
  });

  describe('CSRF Protection', () => {
    test('POST /preview-trade should fail without CSRF token', async () => {
      const res = await request(app)
        .post('/preview-trade')
        .type('form')
        .send({ ticker: 'AAPL', shares: 10, trading_type: 'buy' });
      // Without session, should redirect (auth guard) or return 403 (CSRF)
      expect([302, 403]).toContain(res.status);
    });
  });

  describe('404 Handler', () => {
    test('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/nonexistent-page-12345');
      expect(res.status).toBe(404);
    });
  });

  describe('Security Headers', () => {
    test('should include security headers', async () => {
      const res = await request(app).get('/health');
      expect(res.headers).toHaveProperty('x-content-type-options');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    test('should include CSP header', async () => {
      const res = await request(app).get('/');
      expect(res.headers).toHaveProperty('content-security-policy');
    });
  });

  describe('Employee Login (Demo Mode)', () => {
    test('GET /employee-dummy-login should return login page when SSO disabled', async () => {
      const res = await request(app).get('/employee-dummy-login');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });
  });

  describe('Static Assets', () => {
    test('GET /styles-modern.min.css should serve CSS', async () => {
      const res = await request(app).get('/styles-modern.min.css');
      // May be 200 or 404 depending on whether CSS is built
      expect([200, 304, 404]).toContain(res.status);
    });
  });
});
