/**
 * Retry logic with exponential backoff and circuit breaker pattern
 * Zero-cost resilience for external API calls
 */

/**
 * Retry a function with exponential backoff
 */
async function withRetry(fn, options = {}) {
  const { 
    retries = 2, 
    delayMs = 300, 
    maxDelayMs = 5000,
    backoffMultiplier = 2 
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on the last attempt
      if (attempt === retries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        delayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Simple circuit breaker to prevent cascading failures
 */
class CircuitBreaker {
  constructor(options = {}) {
    const { 
      failureThreshold = 3, 
      cooldownMs = 30000, // 30 seconds
      monitoringWindowMs = 60000 // 1 minute
    } = options;
    
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.monitoringWindowMs = monitoringWindowMs;
    
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttemptTime = 0;
    
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      circuitOpens: 0
    };
  }

  canCall() {
    this.stats.totalCalls++;
    
    const now = Date.now();
    
    if (this.state === 'OPEN') {
      if (now >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    
    return true;
  }

  recordSuccess() {
    this.stats.successfulCalls++;
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
  }

  recordFailure() {
    this.stats.failedCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.cooldownMs;
      this.stats.circuitOpens++;
    }
  }

  getState() {
    return this.state;
  }

  getStats() {
    return {
      ...this.stats,
      state: this.state,
      failureRate: this.stats.failedCalls / Math.max(1, this.stats.totalCalls),
      currentFailures: this.failureCount,
      isOpen: this.state === 'OPEN'
    };
  }

  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.nextAttemptTime = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Combine retry logic with circuit breaker
 */
async function callWithResilience(fn, circuitBreaker, retryOptions = {}) {
  if (!circuitBreaker.canCall()) {
    throw new Error(`Circuit breaker is OPEN. Service unavailable until ${new Date(circuitBreaker.nextAttemptTime).toISOString()}`);
  }

  try {
    const result = await withRetry(fn, retryOptions);
    circuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    circuitBreaker.recordFailure();
    throw error;
  }
}

module.exports = {
  withRetry,
  CircuitBreaker,
  callWithResilience
};