/**
 * Simple in-memory TTL cache for external API responses
 * Zero-cost caching solution with automatic expiration and LRU eviction
 */
class SimpleCache {
  constructor(defaultTtlMs = 5 * 60 * 1000, maxSize = 1000) { // 5 minutes default, 1000 items max
    this.defaultTtlMs = defaultTtlMs;
    this.maxSize = maxSize;
    this.keyToEntry = new Map(); // Map preserves insertion order (LRU)
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
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

    // Move to end (most recently used) by deleting and reinserting
    this.keyToEntry.delete(key);
    this.keyToEntry.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    // Remove existing key to maintain LRU order (will be reinserted at end)
    if (this.keyToEntry.has(key)) {
      this.keyToEntry.delete(key);
    }

    // Evict least recently used entry if at capacity
    if (this.keyToEntry.size >= this.maxSize) {
      // Map iterates in insertion order, first key is least recently used
      const firstKey = this.keyToEntry.keys().next().value;
      this.keyToEntry.delete(firstKey);
      this.stats.evictions++;
    }

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
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
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