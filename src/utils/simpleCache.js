/**
 * Simple in-memory TTL cache for external API responses
 * Zero-cost caching solution with automatic expiration
 */
class SimpleCache {
  constructor(defaultTtlMs = 5 * 60 * 1000) { // 5 minutes default
    this.defaultTtlMs = defaultTtlMs;
    this.keyToEntry = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  get(key) {
    const entry = this.keyToEntry.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.keyToEntry.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.keyToEntry.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
    this.stats.sets++;
  }

  getStats() {
    return {
      ...this.stats,
      size: this.keyToEntry.size,
      hitRate: this.stats.hits / Math.max(1, this.stats.hits + this.stats.misses)
    };
  }

  clear() {
    this.keyToEntry.clear();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  // Periodic cleanup of expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.keyToEntry.entries()) {
      if (now > entry.expiresAt) {
        this.keyToEntry.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

module.exports = { SimpleCache };