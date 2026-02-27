// Mock database module before importing anything
jest.mock('../../../src/models/database');
const EmployeeProfile = require('../../../src/models/EmployeeProfile');
const database = require('../../../src/models/database');
const { mockGet, mockQuery, mockRun } = require('../../utils/mockHelpers');

// Mock uuid to return predictable values
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-profile-uuid')
}));

describe('EmployeeProfile Model', () => {
  describe('tableName', () => {
    test('should return employee_profiles', () => {
      expect(EmployeeProfile.tableName).toBe('employee_profiles');
    });
  });

  describe('getByEmail', () => {
    test('should return a profile by email', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockProfile = {
        uuid: 'profile-uuid',
        employee_email: 'user@example.com',
        accounts_confirmed_at: '2025-06-01T00:00:00Z'
      };
      mockGet(mockProfile);

      const result = await EmployeeProfile.getByEmail('User@Example.com');

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE employee_email = $1'),
        ['user@example.com']
      );
      expect(result).toEqual(mockProfile);
    });

    test('should return null for null email', async () => {
      const result = await EmployeeProfile.getByEmail(null);
      expect(result).toBeNull();
      expect(database.get).not.toHaveBeenCalled();
    });

    test('should return null for undefined email', async () => {
      const result = await EmployeeProfile.getByEmail(undefined);
      expect(result).toBeNull();
    });

    test('should return null for empty string email', async () => {
      const result = await EmployeeProfile.getByEmail('');
      expect(result).toBeNull();
    });

    test('should lowercase the email', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      await EmployeeProfile.getByEmail('ADMIN@COMPANY.COM');

      expect(database.get).toHaveBeenCalledWith(
        expect.any(String),
        ['admin@company.com']
      );
    });

    test('should return null when profile does not exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await EmployeeProfile.getByEmail('nobody@test.com');
      expect(result).toBeNull();
    });
  });

  describe('isConfirmationCurrent', () => {
    test('should return true when confirmation is within 30 days', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ is_current: true });

      const result = await EmployeeProfile.isConfirmationCurrent('user@test.com');

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining("accounts_confirmed_at > NOW() - INTERVAL '30 days'"),
        ['user@test.com']
      );
      expect(result).toBe(true);
    });

    test('should return false when confirmation is older than 30 days', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ is_current: false });

      const result = await EmployeeProfile.isConfirmationCurrent('user@test.com');
      expect(result).toBe(false);
    });

    test('should return false for null email', async () => {
      const result = await EmployeeProfile.isConfirmationCurrent(null);
      expect(result).toBe(false);
      expect(database.get).not.toHaveBeenCalled();
    });

    test('should return false for undefined email', async () => {
      const result = await EmployeeProfile.isConfirmationCurrent(undefined);
      expect(result).toBe(false);
    });

    test('should return false for empty string email', async () => {
      const result = await EmployeeProfile.isConfirmationCurrent('');
      expect(result).toBe(false);
    });

    test('should return false when no profile exists (null result)', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await EmployeeProfile.isConfirmationCurrent('user@test.com');
      expect(result).toBe(false);
    });

    test('should return false when is_current is undefined on result', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({});

      const result = await EmployeeProfile.isConfirmationCurrent('user@test.com');
      expect(result).toBe(false);
    });

    test('should lowercase the email', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ is_current: true });

      await EmployeeProfile.isConfirmationCurrent('USER@COMPANY.COM');

      expect(database.get).toHaveBeenCalledWith(
        expect.any(String),
        ['user@company.com']
      );
    });
  });

  describe('confirmAccounts', () => {
    test('should upsert account confirmation and return profile', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockProfile = {
        uuid: 'mock-profile-uuid',
        employee_email: 'user@test.com',
        accounts_confirmed_at: '2025-06-15T12:00:00Z'
      };
      mockQuery([mockProfile]);

      const result = await EmployeeProfile.confirmAccounts('User@Test.com');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO employee_profiles'),
        ['mock-profile-uuid', 'user@test.com']
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (employee_email)'),
        expect.any(Array)
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('DO UPDATE SET accounts_confirmed_at = NOW()'),
        expect.any(Array)
      );
      expect(result).toEqual(mockProfile);
    });

    test('should lowercase the email on insert', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-profile-uuid' }]);

      await EmployeeProfile.confirmAccounts('ADMIN@COMPANY.COM');

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        ['mock-profile-uuid', 'admin@company.com']
      );
    });

    test('should return null when query returns empty (should not normally happen)', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await EmployeeProfile.confirmAccounts('user@test.com');
      expect(result).toBeNull();
    });

    test('should return null when query returns null', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery(null);

      const result = await EmployeeProfile.confirmAccounts('user@test.com');
      expect(result).toBeNull();
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.query.mockRejectedValueOnce(new Error('Upsert failed'));

      await expect(
        EmployeeProfile.confirmAccounts('user@test.com')
      ).rejects.toThrow('Upsert failed');
    });
  });
});
