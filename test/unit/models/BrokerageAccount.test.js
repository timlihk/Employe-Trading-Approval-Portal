// Mock database module before importing anything
jest.mock('../../../src/models/database');
const BrokerageAccount = require('../../../src/models/BrokerageAccount');
const database = require('../../../src/models/database');
const { mockGet, mockQuery, mockRun } = require('../../utils/mockHelpers');

// Mock uuid to return predictable values
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-brokerage-uuid')
}));

describe('BrokerageAccount Model', () => {
  describe('tableName', () => {
    test('should return brokerage_accounts', () => {
      expect(BrokerageAccount.tableName).toBe('brokerage_accounts');
    });
  });

  describe('getByEmployee', () => {
    test('should return all accounts for an employee', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockAccounts = [
        { uuid: 'acc-1', employee_email: 'user@test.com', firm_name: 'Charles Schwab', account_number: '1234' },
        { uuid: 'acc-2', employee_email: 'user@test.com', firm_name: 'Fidelity', account_number: '5678' }
      ];
      mockQuery(mockAccounts);

      const result = await BrokerageAccount.getByEmployee('User@Test.com');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE employee_email = $1'),
        ['user@test.com']
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY firm_name ASC, account_number ASC'),
        ['user@test.com']
      );
      expect(result).toEqual(mockAccounts);
    });

    test('should return empty array for null email', async () => {
      const result = await BrokerageAccount.getByEmployee(null);
      expect(result).toEqual([]);
      expect(database.query).not.toHaveBeenCalled();
    });

    test('should return empty array for undefined email', async () => {
      const result = await BrokerageAccount.getByEmployee(undefined);
      expect(result).toEqual([]);
    });

    test('should return empty array for empty string email', async () => {
      const result = await BrokerageAccount.getByEmployee('');
      expect(result).toEqual([]);
    });

    test('should lowercase the email', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await BrokerageAccount.getByEmployee('ADMIN@EXAMPLE.COM');

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        ['admin@example.com']
      );
    });

    test('should return empty array when employee has no accounts', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await BrokerageAccount.getByEmployee('nobody@test.com');
      expect(result).toEqual([]);
    });
  });

  describe('findByUuid', () => {
    test('should return an account by UUID', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockAccount = {
        uuid: 'acc-uuid-1',
        employee_email: 'user@test.com',
        firm_name: 'Schwab',
        account_number: '1234'
      };
      mockGet(mockAccount);

      const result = await BrokerageAccount.findByUuid('acc-uuid-1');

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE uuid = $1'),
        ['acc-uuid-1']
      );
      expect(result).toEqual(mockAccount);
    });

    test('should return null for null uuid', async () => {
      const result = await BrokerageAccount.findByUuid(null);
      expect(result).toBeNull();
      expect(database.get).not.toHaveBeenCalled();
    });

    test('should return null for undefined uuid', async () => {
      const result = await BrokerageAccount.findByUuid(undefined);
      expect(result).toBeNull();
    });

    test('should return null when uuid not found', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await BrokerageAccount.findByUuid('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    test('should create a new brokerage account', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockCreated = {
        uuid: 'mock-brokerage-uuid',
        employee_email: 'user@test.com',
        firm_name: 'Interactive Brokers',
        account_number: 'U12345678'
      };
      mockQuery([mockCreated]);

      const data = {
        employee_email: 'User@Test.com',
        firm_name: '  Interactive Brokers  ',
        account_number: '  U12345678  '
      };

      const result = await BrokerageAccount.create(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO brokerage_accounts'),
        [
          'mock-brokerage-uuid',
          'user@test.com',
          'Interactive Brokers',
          'U12345678'
        ]
      );
      expect(result).toEqual(mockCreated);
    });

    test('should trim firm_name and account_number', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-brokerage-uuid' }]);

      const data = {
        employee_email: 'user@test.com',
        firm_name: '   Schwab   ',
        account_number: '   9999   '
      };

      await BrokerageAccount.create(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        ['mock-brokerage-uuid', 'user@test.com', 'Schwab', '9999']
      );
    });

    test('should lowercase the employee email', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-brokerage-uuid' }]);

      const data = {
        employee_email: 'ADMIN@EXAMPLE.COM',
        firm_name: 'Fidelity',
        account_number: '1234'
      };

      await BrokerageAccount.create(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['admin@example.com'])
      );
    });

    test('should return null on conflict (duplicate account)', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]); // ON CONFLICT DO NOTHING returns empty

      const data = {
        employee_email: 'user@test.com',
        firm_name: 'Schwab',
        account_number: '1234'
      };

      const result = await BrokerageAccount.create(data);
      expect(result).toBeNull();
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.query.mockRejectedValueOnce(new Error('Insert failed'));

      const data = {
        employee_email: 'user@test.com',
        firm_name: 'Schwab',
        account_number: '1234'
      };

      await expect(BrokerageAccount.create(data)).rejects.toThrow('Insert failed');
    });
  });

  describe('update', () => {
    test('should update a brokerage account with email ownership check', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockUpdated = {
        uuid: 'acc-uuid',
        employee_email: 'user@test.com',
        firm_name: 'New Firm',
        account_number: 'NEW-1234'
      };
      mockQuery([mockUpdated]);

      const result = await BrokerageAccount.update(
        'acc-uuid',
        'User@Test.com',
        { firm_name: '  New Firm  ', account_number: '  NEW-1234  ' }
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE brokerage_accounts'),
        ['acc-uuid', 'user@test.com', 'New Firm', 'NEW-1234']
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE uuid = $1 AND employee_email = $2'),
        expect.any(Array)
      );
      expect(result).toEqual(mockUpdated);
    });

    test('should return null when uuid or email does not match', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]); // No rows returned = not found or not owned

      const result = await BrokerageAccount.update(
        'wrong-uuid',
        'user@test.com',
        { firm_name: 'Firm', account_number: '1234' }
      );

      expect(result).toBeNull();
    });

    test('should lowercase the email for ownership check', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await BrokerageAccount.update(
        'acc-uuid',
        'ADMIN@TEST.COM',
        { firm_name: 'Firm', account_number: '1234' }
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['admin@test.com'])
      );
    });

    test('should trim firm_name and account_number', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'acc-uuid' }]);

      await BrokerageAccount.update(
        'acc-uuid',
        'user@test.com',
        { firm_name: '  Trimmed  ', account_number: '  0000  ' }
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        ['acc-uuid', 'user@test.com', 'Trimmed', '0000']
      );
    });
  });

  describe('delete', () => {
    test('should delete a brokerage account with email ownership check', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'acc-uuid' }]);

      const result = await BrokerageAccount.delete('acc-uuid', 'User@Test.com');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM brokerage_accounts'),
        ['acc-uuid', 'user@test.com']
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE uuid = $1 AND employee_email = $2'),
        expect.any(Array)
      );
      expect(result).toBe(true);
    });

    test('should return false when uuid or email does not match', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]); // No rows deleted

      const result = await BrokerageAccount.delete('wrong-uuid', 'user@test.com');
      expect(result).toBe(false);
    });

    test('should lowercase the email for ownership check', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await BrokerageAccount.delete('acc-uuid', 'ADMIN@TEST.COM');

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        ['acc-uuid', 'admin@test.com']
      );
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.query.mockRejectedValueOnce(new Error('Delete error'));

      await expect(
        BrokerageAccount.delete('acc-uuid', 'user@test.com')
      ).rejects.toThrow('Delete error');
    });
  });
});
