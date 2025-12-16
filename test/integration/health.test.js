const request = require('supertest');
const { createTestApp } = require('../setup');

describe('Health Endpoint', () => {
  let app;

  beforeAll(async () => {
    app = await createTestApp();
  });

  test('GET /health returns healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('database');
  });
});