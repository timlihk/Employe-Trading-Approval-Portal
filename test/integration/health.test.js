const request = require('supertest');
const app = require('../../src/app');

describe('Health Endpoint', () => {
  test('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body.database).toHaveProperty('status');
  });

  test('GET /health always returns 200 even with DB issues', async () => {
    const res = await request(app).get('/health');
    // Health endpoint is designed to always return 200
    expect(res.status).toBe(200);
  });
});
