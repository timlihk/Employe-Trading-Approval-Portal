const TradingRequestService = require('./src/services/TradingRequestService');

async function testInvalidTicker() {
  console.log('Testing invalid ticker validation...\n');
  
  const invalidTickers = ['XXXXX', 'INVALID123', 'NOTREAL'];
  
  for (const ticker of invalidTickers) {
    console.log(`\nTesting ticker: ${ticker}`);
    console.log('=' .repeat(50));
    
    try {
      const result = await TradingRequestService.validateTicker(ticker);
      
      if (!result.isValid) {
        console.log('❌ Ticker is invalid');
        console.log('Error message:', result.error);
        console.log('\nFull result object:');
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('✅ Ticker validated (unexpected!)');
        console.log(result);
      }
    } catch (error) {
      console.log('Exception thrown:', error.message);
    }
  }
  
  process.exit(0);
}

testInvalidTicker();