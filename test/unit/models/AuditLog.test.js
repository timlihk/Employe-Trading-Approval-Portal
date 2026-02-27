// Mock database module before importing anything
jest.mock('../../../src/models/database');
const AuditLog = require('../../../src/models/AuditLog');
const database = require('../../../src/models/database');
const { mockGet, mockQuery, mockRun, mockQueryError } = require('../../utils/mockHelpers');

// Mock uuid to return predictable values
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-audit-uuid')
}));

describe('AuditLog Model', () => {
  describe('tableName', () => {
    test('should return audit_logs', () => {
      expect(AuditLog.tableName).toBe('audit_logs');
    });
  });

  describe('logActivity', () => {
    test('should insert an audit log entry with all parameters', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-audit-uuid' }]);

      const result = await AuditLog.logActivity(
        'Admin@Example.com',
        'admin',
        'approve_trade',
        'trading_request',
        'target-uuid-123',
        'Approved trade for AAPL',
        '192.168.1.1',
        'Mozilla/5.0',
        'session-abc'
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        [
          'mock-audit-uuid',
          'admin@example.com', // email should be lowercased
          'admin',
          'approve_trade',
          'trading_request',
          'target-uuid-123',
          'Approved trade for AAPL',
          '192.168.1.1',
          'Mozilla/5.0',
          'session-abc'
        ]
      );
      expect(result).toBe('mock-audit-uuid');
    });

    test('should insert with null optional parameters', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-audit-uuid' }]);

      const result = await AuditLog.logActivity(
        'user@example.com',
        'employee',
        'login',
        'session'
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        [
          'mock-audit-uuid',
          'user@example.com',
          'employee',
          'login',
          'session',
          null,  // targetId
          null,  // details
          null,  // ipAddress
          null,  // userAgent
          null   // sessionId
        ]
      );
      expect(result).toBe('mock-audit-uuid');
    });

    test('should convert email to lowercase', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-audit-uuid' }]);

      await AuditLog.logActivity('USER@EXAMPLE.COM', 'employee', 'login', 'session');

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['user@example.com'])
      );
    });

    test('should fallback to generated uuid when query returns empty result', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await AuditLog.logActivity(
        'user@example.com', 'employee', 'login', 'session'
      );

      expect(result).toBe('mock-audit-uuid');
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.query.mockRejectedValueOnce(new Error('Insert failed'));

      await expect(
        AuditLog.logActivity('user@example.com', 'employee', 'login', 'session')
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('getAuditLogs', () => {
    test('should return all logs without filters (non-paginated)', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockLogs = [
        { uuid: '1', action: 'login', user_email: 'a@test.com' },
        { uuid: '2', action: 'logout', user_email: 'b@test.com' }
      ];
      mockQuery(mockLogs);

      const result = await AuditLog.getAuditLogs();

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM audit_logs'),
        []
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        []
      );
      expect(result).toEqual(mockLogs);
    });

    test('should filter by userEmail', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getAuditLogs({ userEmail: 'Admin@Test.com' });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('user_email = $1'),
        ['admin@test.com']
      );
    });

    test('should filter by userType', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getAuditLogs({ userType: 'admin' });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('user_type = $1'),
        ['admin']
      );
    });

    test('should filter by action', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getAuditLogs({ action: 'login' });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('action = $1'),
        ['login']
      );
    });

    test('should filter by targetType', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getAuditLogs({ targetType: 'trading_request' });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('target_type = $1'),
        ['trading_request']
      );
    });

    test('should filter by date range', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getAuditLogs({ startDate: '2025-01-01', endDate: '2025-12-31' });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >='),
        ['2025-01-01', '2025-12-31']
      );
    });

    test('should apply limit without pagination', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getAuditLogs({ limit: 10 });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [10]
      );
    });

    test('should return paginated results when page and limit are provided', async () => {
      // getPool called twice: once for count query, once for results query
      database.getPool.mockReturnValue({});
      const mockCountResult = [{ total: 50 }];
      const mockRows = [
        { uuid: '1', action: 'login' },
        { uuid: '2', action: 'logout' }
      ];
      // First call: count query, second call: results query
      database.query
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce(mockRows);

      const result = await AuditLog.getAuditLogs({ page: 2, limit: 10 });

      expect(database.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        data: mockRows,
        pagination: {
          total: 50,
          page: 2,
          limit: 10,
          pages: 5
        }
      });
    });

    test('should combine multiple filters', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getAuditLogs({
        userEmail: 'test@example.com',
        userType: 'admin',
        action: 'approve_trade'
      });

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('user_email = $1'),
        expect.arrayContaining(['test@example.com', 'admin', 'approve_trade'])
      );
    });
  });

  describe('getAuditSummary', () => {
    test('should return summary without filters', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockSummary = {
        total_activities: 100,
        unique_users: 15,
        admin_activities: 30,
        employee_activities: 70,
        login_activities: 40,
        create_activities: 20,
        update_activities: 25,
        delete_activities: 15
      };
      mockGet(mockSummary);

      const result = await AuditLog.getAuditSummary();

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        []
      );
      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as total_activities'),
        []
      );
      expect(result).toEqual(mockSummary);
    });

    test('should apply filters to summary', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ total_activities: 5 });

      await AuditLog.getAuditSummary({ userEmail: 'admin@test.com' });

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        ['admin@test.com']
      );
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.get.mockRejectedValueOnce(new Error('Query failed'));

      await expect(AuditLog.getAuditSummary()).rejects.toThrow('Query failed');
    });
  });

  describe('cleanupOldLogs', () => {
    test('should delete logs older than retention period', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 42);

      const result = await AuditLog.cleanupOldLogs(90);

      expect(database.run).toHaveBeenCalledWith(
        'DELETE FROM audit_logs WHERE created_at < $1',
        [expect.any(String)]
      );
      expect(result).toBe(42);
    });

    test('should return zero when no old logs exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 0);

      const result = await AuditLog.cleanupOldLogs(30);
      expect(result).toBe(0);
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.run.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(AuditLog.cleanupOldLogs(30)).rejects.toThrow('Delete failed');
    });
  });

  describe('getActivityByUser', () => {
    test('should return activity for a specific user', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockActivities = [
        { uuid: '1', action: 'login', user_email: 'user@test.com' },
        { uuid: '2', action: 'view_request', user_email: 'user@test.com' }
      ];
      mockQuery(mockActivities);

      const result = await AuditLog.getActivityByUser('User@Test.com');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_email = $1'),
        ['user@test.com', 50]
      );
      expect(result).toEqual(mockActivities);
    });

    test('should use custom limit', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getActivityByUser('user@test.com', 10);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['user@test.com', 10]
      );
    });

    test('should convert email to lowercase', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getActivityByUser('ADMIN@TEST.COM');

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        ['admin@test.com', 50]
      );
    });
  });

  describe('getRecentActivity', () => {
    test('should return activity from the last 24 hours by default', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockActivities = [{ uuid: '1', action: 'login' }];
      mockQuery(mockActivities);

      const result = await AuditLog.getRecentActivity();

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE created_at >= $1'),
        [expect.any(String), 100]
      );
      expect(result).toEqual(mockActivities);
    });

    test('should use custom hours and limit', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await AuditLog.getRecentActivity(48, 200);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [expect.any(String), 200]
      );
    });
  });

  describe('_buildAuditConditions', () => {
    test('should return empty conditions for empty filters', () => {
      const result = AuditLog._buildAuditConditions({});
      expect(result.conditions).toEqual([]);
      expect(result.params).toEqual([]);
      expect(result.paramIndex).toBe(1);
    });

    test('should build conditions for userEmail', () => {
      const result = AuditLog._buildAuditConditions({ userEmail: 'Test@Example.com' });
      expect(result.conditions).toContain('user_email = $1');
      expect(result.params).toContain('test@example.com');
    });

    test('should build conditions for userType', () => {
      const result = AuditLog._buildAuditConditions({ userType: 'admin' });
      expect(result.conditions).toContain('user_type = $1');
      expect(result.params).toContain('admin');
    });

    test('should build conditions for action', () => {
      const result = AuditLog._buildAuditConditions({ action: 'login' });
      expect(result.conditions).toContain('action = $1');
      expect(result.params).toContain('login');
    });

    test('should build conditions for targetType', () => {
      const result = AuditLog._buildAuditConditions({ targetType: 'trading_request' });
      expect(result.conditions).toContain('target_type = $1');
      expect(result.params).toContain('trading_request');
    });

    test('should build conditions for date range', () => {
      const result = AuditLog._buildAuditConditions({
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      });
      expect(result.conditions.length).toBe(2);
      expect(result.params).toContain('2025-01-01');
      expect(result.params).toContain('2025-12-31');
    });

    test('should skip null, undefined, and empty string values', () => {
      const result = AuditLog._buildAuditConditions({
        userEmail: null,
        userType: undefined,
        action: '',
        targetType: 'trading_request'
      });
      expect(result.conditions.length).toBe(1);
      expect(result.params).toEqual(['trading_request']);
    });

    test('should use custom initial param index', () => {
      const result = AuditLog._buildAuditConditions({ action: 'login' }, 5);
      expect(result.conditions).toContain('action = $5');
      expect(result.paramIndex).toBe(6);
    });

    test('should increment paramIndex correctly with multiple conditions', () => {
      const result = AuditLog._buildAuditConditions({
        userEmail: 'test@test.com',
        userType: 'admin',
        action: 'login',
        targetType: 'session',
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      });
      expect(result.conditions.length).toBe(6);
      expect(result.params.length).toBe(6);
      expect(result.paramIndex).toBe(7);
    });
  });
});
