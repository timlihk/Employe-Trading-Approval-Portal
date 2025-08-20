// Mock data service for local testing without database
const { v4: uuidv4 } = require('uuid');

class MockDataService {
  constructor() {
    this.mockData = {
      tradingRequests: [
        {
          id: 1,
          employee_email: 'john.doe@company.com',
          stock_name: 'Apple Inc.',
          ticker: 'AAPL',
          shares: 100,
          share_price: 150.00,
          total_value: 15000.00,
          currency: 'USD',
          share_price_usd: 150.00,
          total_value_usd: 15000.00,
          exchange_rate: 1,
          trading_type: 'buy',
          instrument_type: 'equity',
          status: 'approved',
          created_at: new Date().toISOString(),
          processed_at: new Date().toISOString()
        },
        {
          id: 2,
          employee_email: 'jane.smith@company.com',
          stock_name: 'US Treasury Bond',
          ticker: 'US1234567890',
          shares: 10,
          share_price: 1000.00,
          total_value: 10000.00,
          currency: 'USD',
          share_price_usd: 1000.00,
          total_value_usd: 10000.00,
          exchange_rate: 1,
          trading_type: 'buy',
          instrument_type: 'bond',
          status: 'pending',
          created_at: new Date().toISOString(),
          processed_at: null
        }
      ],
      restrictedStocks: [
        {
          id: 1,
          ticker: 'TSLA',
          company_name: 'Tesla Inc.',
          instrument_type: 'equity',
          created_at: new Date().toISOString()
        }
      ]
    };
  }

  // Mock trading request methods
  async createTradingRequest(data) {
    const newRequest = {
      uuid: uuidv4(),
      ...data,
      created_at: new Date().toISOString(),
      processed_at: new Date().toISOString()
    };
    this.mockData.tradingRequests.push(newRequest);
    return newRequest;
  }

  async getTradingRequests(email = null) {
    if (email) {
      return this.mockData.tradingRequests.filter(req => req.employee_email === email);
    }
    return this.mockData.tradingRequests;
  }

  async getRestrictedStocks() {
    return this.mockData.restrictedStocks;
  }

  async checkRestrictedStatus(ticker) {
    return this.mockData.restrictedStocks.some(stock => 
      stock.ticker.toUpperCase() === ticker.toUpperCase()
    );
  }

  // Mock admin methods
  async authenticateAdmin(username, password) {
    // Simple mock authentication
    if (username === 'admin' && password === 'admin') {
      return { authenticated: true, username: 'admin' };
    }
    return { authenticated: false };
  }
}

module.exports = new MockDataService();