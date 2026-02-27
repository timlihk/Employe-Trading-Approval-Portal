const { formatUuid, getDisplayId } = require('../../../src/utils/formatters');

describe('formatters', () => {
  describe('formatUuid', () => {
    test('should return "N/A" for null input', () => {
      expect(formatUuid(null)).toBe('N/A');
    });

    test('should return "N/A" for undefined input', () => {
      expect(formatUuid(undefined)).toBe('N/A');
    });

    test('should return "N/A" for empty string', () => {
      expect(formatUuid('')).toBe('N/A');
    });

    test('should format a full UUID to first 8 characters uppercase', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      expect(formatUuid(uuid)).toBe('A1B2C3D4');
    });

    test('should format a lowercase UUID correctly', () => {
      const uuid = 'abcdef12-3456-7890-abcd-ef1234567890';
      expect(formatUuid(uuid)).toBe('ABCDEF12');
    });

    test('should format an uppercase UUID correctly', () => {
      const uuid = 'ABCDEF12-3456-7890-ABCD-EF1234567890';
      expect(formatUuid(uuid)).toBe('ABCDEF12');
    });

    test('should format a mixed-case UUID correctly', () => {
      const uuid = 'aBcDeF12-3456-7890-abCD-ef1234567890';
      expect(formatUuid(uuid)).toBe('ABCDEF12');
    });

    test('should prefix legacy numeric IDs with #', () => {
      expect(formatUuid('1')).toBe('#1');
      expect(formatUuid('42')).toBe('#42');
      expect(formatUuid('12345')).toBe('#12345');
      expect(formatUuid('999999')).toBe('#999999');
    });

    test('should prefix zero as a numeric ID', () => {
      expect(formatUuid('0')).toBe('#0');
    });

    test('should return non-UUID, non-numeric strings as-is', () => {
      expect(formatUuid('some-random-string')).toBe('some-random-string');
      expect(formatUuid('abc')).toBe('abc');
      expect(formatUuid('not-a-uuid-but-has-dashes')).toBe('not-a-uuid-but-has-dashes');
    });

    test('should not match partial UUIDs', () => {
      // Too short - not a valid UUID format
      const partial = 'a1b2c3d4-e5f6-7890-abcd';
      expect(formatUuid(partial)).toBe(partial);
    });

    test('should not match UUIDs with extra characters', () => {
      const extra = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-extra';
      expect(formatUuid(extra)).toBe(extra);
    });

    test('should handle strings with only special characters', () => {
      expect(formatUuid('---')).toBe('---');
      expect(formatUuid('...')).toBe('...');
    });
  });

  describe('getDisplayId', () => {
    test('should use uuid field when available', () => {
      const request = {
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        id: 42
      };
      expect(getDisplayId(request)).toBe('A1B2C3D4');
    });

    test('should fall back to id when uuid is not available (string id)', () => {
      const request = { id: '42' };
      expect(getDisplayId(request)).toBe('#42');
    });

    test('should fall back to id when uuid is null (string id)', () => {
      const request = { uuid: null, id: '99' };
      // null || '99' = '99'
      expect(getDisplayId(request)).toBe('#99');
    });

    test('should fall back to id when uuid is undefined (string id)', () => {
      const request = { uuid: undefined, id: '7' };
      expect(getDisplayId(request)).toBe('#7');
    });

    test('should handle request with only uuid', () => {
      const request = { uuid: 'deadbeef-1234-5678-9abc-def012345678' };
      expect(getDisplayId(request)).toBe('DEADBEEF');
    });

    test('should handle request with only string numeric id', () => {
      const request = { id: '1' };
      expect(getDisplayId(request)).toBe('#1');
    });

    test('should handle request with non-numeric string id', () => {
      const request = { id: 'custom-id' };
      expect(getDisplayId(request)).toBe('custom-id');
    });

    test('should return "N/A" when neither uuid nor id is present', () => {
      const request = {};
      expect(getDisplayId(request)).toBe('N/A');
    });

    test('should return "N/A" when both uuid and id are falsy', () => {
      const request = { uuid: '', id: 0 };
      // '' || 0 = 0, formatUuid(0) - 0 is falsy so returns 'N/A'
      expect(getDisplayId(request)).toBe('N/A');
    });

    test('should handle uuid that is a non-standard format string', () => {
      const request = { uuid: 'short-id', id: '10' };
      expect(getDisplayId(request)).toBe('short-id');
    });
  });
});
