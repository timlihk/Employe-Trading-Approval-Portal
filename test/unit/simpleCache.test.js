const { SimpleCache } = require('../../src/utils/simpleCache');

describe('SimpleCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SimpleCache(1000, 5); // 1 second TTL, max 5 items for testing
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize with default TTL and max size', () => {
      const defaultCache = new SimpleCache();
      expect(defaultCache.defaultTtlMs).toBe(5 * 60 * 1000); // 5 minutes
      expect(defaultCache.maxSize).toBe(1000);
    });

    test('should initialize with custom TTL and max size', () => {
      expect(cache.defaultTtlMs).toBe(1000);
      expect(cache.maxSize).toBe(5);
    });

    test('should initialize empty stats', () => {
      expect(cache.getStats()).toEqual({
        hits: 0,
        misses: 0,
        sets: 0,
        evictions: 0,
        size: 0,
        hitRate: 0
      });
    });
  });

  describe('set and get', () => {
    test('should set and retrieve a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.getStats().hits).toBe(1);
      expect(cache.getStats().size).toBe(1);
    });

    test('should return null for non-existent key', () => {
      expect(cache.get('missing')).toBeNull();
      expect(cache.getStats().misses).toBe(1);
    });

    test('should update existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.getStats().sets).toBe(2);
    });

    test('should respect custom TTL', () => {
      cache.set('key1', 'value1', 500); // 500ms TTL
      jest.advanceTimersByTime(400);
      expect(cache.get('key1')).toBe('value1'); // Still valid
      jest.advanceTimersByTime(200);
      expect(cache.get('key1')).toBeNull(); // Expired
      expect(cache.getStats().misses).toBe(1);
    });

    test('should expire entries after TTL', () => {
      cache.set('key1', 'value1');
      jest.advanceTimersByTime(1500); // Past TTL
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    test('should evict least recently used when at capacity', () => {
      // Fill cache to capacity
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');
      expect(cache.getStats().size).toBe(5);

      // Add one more - should evict key1 (oldest)
      cache.set('key6', 'value6');
      expect(cache.getStats().size).toBe(5);
      expect(cache.getStats().evictions).toBe(1);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key6')).toBe('value6');

      // Access key2 to make it recently used
      cache.get('key2');
      cache.set('key7', 'value7');
      expect(cache.get('key3')).toBeNull(); // key3 should be evicted (oldest after key1)
      expect(cache.get('key7')).toBe('value7');
    });

    test('should maintain LRU order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1, making it most recently used
      cache.get('key1');

      // Fill cache to capacity
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // Add one more - should evict key2 (oldest, key1 was recently accessed)
      cache.set('key6', 'value6');
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('stats', () => {
    test('should track hits and misses', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('missing'); // miss
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5); // 2/(2+2) = 0.5
    });

    test('should track evictions', () => {
      // Fill and exceed capacity
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');
      cache.set('key6', 'value6'); // Evicts key1

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
      expect(stats.sets).toBe(6);
    });
  });

  describe('cleanup', () => {
    test('should remove expired entries', () => {
      cache.set('key1', 'value1', 500);
      cache.set('key2', 'value2', 1500);
      jest.advanceTimersByTime(1000);

      const cleaned = cache.cleanup();
      expect(cleaned).toBe(1); // key1 expired
      expect(cache.getStats().size).toBe(1);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('clear', () => {
    test('should clear all entries and reset stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1');

      cache.clear();

      expect(cache.getStats()).toEqual({
        hits: 0,
        misses: 0,
        sets: 0,
        evictions: 0,
        size: 0,
        hitRate: 0
      });
      expect(cache.get('key1')).toBeNull();
    });
  });
});