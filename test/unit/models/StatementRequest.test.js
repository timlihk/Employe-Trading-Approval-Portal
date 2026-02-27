// Mock database module before importing anything
jest.mock('../../../src/models/database');
const StatementRequest = require('../../../src/models/StatementRequest');
const database = require('../../../src/models/database');
const { mockGet, mockQuery, mockRun, mockQueryError } = require('../../utils/mockHelpers');

// Mock uuid and crypto
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-stmt-uuid')
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'mock-upload-token-hex')
  }))
}));

describe('StatementRequest Model', () => {
  describe('tableName', () => {
    test('should return statement_requests', () => {
      expect(StatementRequest.tableName).toBe('statement_requests');
    });
  });

  describe('createRequest', () => {
    test('should create a statement request with valid data', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRow = {
        uuid: 'mock-stmt-uuid',
        period_year: 2025,
        period_month: 6,
        employee_email: 'employee@example.com',
        status: 'pending'
      };
      mockQuery([mockRow]);

      const data = {
        period_year: 2025,
        period_month: 6,
        employee_email: 'Employee@Example.com',
        employee_name: 'John Doe',
        brokerage_name: 'Interactive Brokers'
      };

      const result = await StatementRequest.createRequest(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO statement_requests'),
        expect.arrayContaining([
          'mock-stmt-uuid',
          2025,
          6,
          'employee@example.com',
          'John Doe',
          'pending',
          'mock-upload-token-hex',
          expect.any(String), // deadline
          expect.any(String), // email_sent_at
          'Interactive Brokers'
        ])
      );
      expect(result).toEqual(mockRow);
    });

    test('should return null on conflict (duplicate)', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]); // ON CONFLICT DO NOTHING returns empty

      const data = {
        period_year: 2025,
        period_month: 6,
        employee_email: 'employee@example.com'
      };

      const result = await StatementRequest.createRequest(data);
      expect(result).toBeNull();
    });

    test('should handle null optional fields', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-stmt-uuid' }]);

      const data = {
        period_year: 2025,
        period_month: 1,
        employee_email: 'test@example.com'
        // employee_name and brokerage_name are omitted
      };

      await StatementRequest.createRequest(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null, null]) // employee_name, brokerage_name
      );
    });

    test('should lowercase the employee email', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-stmt-uuid' }]);

      const data = {
        period_year: 2025,
        period_month: 3,
        employee_email: 'TEST@EXAMPLE.COM'
      };

      await StatementRequest.createRequest(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test@example.com'])
      );
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.query.mockRejectedValueOnce(new Error('DB error'));

      const data = {
        period_year: 2025,
        period_month: 1,
        employee_email: 'test@example.com'
      };

      await expect(StatementRequest.createRequest(data)).rejects.toThrow('DB error');
    });
  });

  describe('findByUploadToken', () => {
    test('should return a request by upload token', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRequest = {
        uuid: 'stmt-uuid',
        upload_token: 'valid-token',
        status: 'pending'
      };
      mockGet(mockRequest);

      const result = await StatementRequest.findByUploadToken('valid-token');

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE upload_token = $1'),
        ['valid-token']
      );
      expect(result).toEqual(mockRequest);
    });

    test('should return null for null token', async () => {
      const result = await StatementRequest.findByUploadToken(null);
      expect(result).toBeNull();
      expect(database.get).not.toHaveBeenCalled();
    });

    test('should return null for undefined token', async () => {
      const result = await StatementRequest.findByUploadToken(undefined);
      expect(result).toBeNull();
    });

    test('should return null for non-string token', async () => {
      const result = await StatementRequest.findByUploadToken(12345);
      expect(result).toBeNull();
    });

    test('should return null when token not found', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await StatementRequest.findByUploadToken('nonexistent-token');
      expect(result).toBeNull();
    });
  });

  describe('markUploaded', () => {
    test('should mark a request as uploaded with SharePoint data', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockUpdated = {
        uuid: 'stmt-uuid',
        status: 'uploaded',
        sharepoint_item_id: 'sp-item-123'
      };
      mockQuery([mockUpdated]);

      const sharepointData = {
        itemId: 'sp-item-123',
        webUrl: 'https://sharepoint.com/file.pdf',
        originalFilename: 'statement.pdf',
        fileSize: 102400,
        contentType: 'application/pdf',
        notes: 'Monthly statement'
      };

      const result = await StatementRequest.markUploaded('stmt-uuid', sharepointData);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE statement_requests'),
        [
          'stmt-uuid',
          expect.any(String), // uploaded_at
          'sp-item-123',
          'https://sharepoint.com/file.pdf',
          'statement.pdf',
          102400,
          'application/pdf',
          'Monthly statement',
          expect.any(String)  // updated_at
        ]
      );
      expect(result).toEqual(mockUpdated);
    });

    test('should handle null optional SharePoint fields', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'stmt-uuid', status: 'uploaded' }]);

      const sharepointData = {};

      await StatementRequest.markUploaded('stmt-uuid', sharepointData);

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        [
          'stmt-uuid',
          expect.any(String),
          null, // itemId
          null, // webUrl
          null, // originalFilename
          null, // fileSize
          null, // contentType
          null, // notes
          expect.any(String)
        ]
      );
    });

    test('should return null when uuid not found', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await StatementRequest.markUploaded('nonexistent', {});
      expect(result).toBeNull();
    });
  });

  describe('getByPeriod', () => {
    test('should return requests for a specific period', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRequests = [
        { uuid: '1', status: 'overdue', employee_email: 'a@test.com' },
        { uuid: '2', status: 'pending', employee_email: 'b@test.com' }
      ];
      mockQuery(mockRequests);

      const result = await StatementRequest.getByPeriod(2025, 6);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE period_year = $1 AND period_month = $2'),
        [2025, 6]
      );
      expect(result).toEqual(mockRequests);
    });

    test('should return empty array when no requests for period', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await StatementRequest.getByPeriod(2020, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getPeriodSummary', () => {
    test('should return aggregate counts for a period', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockSummary = {
        total: 20,
        pending: 5,
        uploaded: 10,
        overdue: 3,
        skipped: 2,
        emails_sent: 18
      };
      mockGet(mockSummary);

      const result = await StatementRequest.getPeriodSummary(2025, 6);

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE period_year = $1 AND period_month = $2'),
        [2025, 6]
      );
      expect(result).toEqual(mockSummary);
    });
  });

  describe('getOverdueRequests', () => {
    test('should return pending requests past their deadline', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockOverdue = [{ uuid: '1', status: 'pending' }];
      mockQuery(mockOverdue);

      const result = await StatementRequest.getOverdueRequests();

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status = 'pending' AND deadline_at < NOW()"),
        []
      );
      expect(result).toEqual(mockOverdue);
    });

    test('should return empty array when no overdue requests', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await StatementRequest.getOverdueRequests();
      expect(result).toEqual([]);
    });
  });

  describe('markOverdue', () => {
    test('should update pending overdue requests', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockMarked = [
        { uuid: 'uuid-1', employee_email: 'a@test.com' },
        { uuid: 'uuid-2', employee_email: 'b@test.com' }
      ];
      mockQuery(mockMarked);

      const result = await StatementRequest.markOverdue();

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'overdue'"),
        []
      );
      expect(result).toEqual(mockMarked);
    });

    test('should return empty array when nothing to mark', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await StatementRequest.markOverdue();
      expect(result).toEqual([]);
    });
  });

  describe('updateEmailMessageId', () => {
    test('should update the email message ID', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const result = await StatementRequest.updateEmailMessageId('stmt-uuid', 'msg-id-abc');

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('SET email_message_id = $2'),
        ['stmt-uuid', 'msg-id-abc']
      );
      expect(result).toEqual({ uuid: null, changes: 1 });
    });
  });

  describe('updateBrokerage', () => {
    test('should update the brokerage name', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const result = await StatementRequest.updateBrokerage('stmt-uuid', 'Charles Schwab');

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('SET brokerage_name = $2'),
        ['stmt-uuid', 'Charles Schwab']
      );
      expect(result).toEqual({ uuid: null, changes: 1 });
    });
  });

  describe('incrementReminderCount', () => {
    test('should increment the reminder count', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const result = await StatementRequest.incrementReminderCount('stmt-uuid');

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('reminder_count = reminder_count + 1'),
        ['stmt-uuid']
      );
      expect(result).toEqual({ uuid: null, changes: 1 });
    });
  });

  describe('getAvailablePeriods', () => {
    test('should return distinct periods ordered by date descending', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockPeriods = [
        { period_year: 2025, period_month: 6 },
        { period_year: 2025, period_month: 5 },
        { period_year: 2025, period_month: 4 }
      ];
      mockQuery(mockPeriods);

      const result = await StatementRequest.getAvailablePeriods();

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT period_year, period_month'),
        []
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 24'),
        []
      );
      expect(result).toEqual(mockPeriods);
    });
  });

  describe('findByUuid', () => {
    test('should return a request by UUID', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRequest = { uuid: 'stmt-uuid', status: 'pending' };
      mockGet(mockRequest);

      const result = await StatementRequest.findByUuid('stmt-uuid');

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE uuid = $1'),
        ['stmt-uuid']
      );
      expect(result).toEqual(mockRequest);
    });

    test('should return null for null uuid', async () => {
      const result = await StatementRequest.findByUuid(null);
      expect(result).toBeNull();
      expect(database.get).not.toHaveBeenCalled();
    });

    test('should return null for undefined uuid', async () => {
      const result = await StatementRequest.findByUuid(undefined);
      expect(result).toBeNull();
    });

    test('should return null when uuid not found', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await StatementRequest.findByUuid('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getByEmployee', () => {
    test('should return requests for a specific employee', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRequests = [
        { uuid: '1', status: 'overdue', employee_email: 'emp@test.com' },
        { uuid: '2', status: 'pending', employee_email: 'emp@test.com' }
      ];
      mockQuery(mockRequests);

      const result = await StatementRequest.getByEmployee('Emp@Test.com');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE employee_email = $1'),
        ['emp@test.com']
      );
      expect(result).toEqual(mockRequests);
    });

    test('should return empty array for null email', async () => {
      const result = await StatementRequest.getByEmployee(null);
      expect(result).toEqual([]);
      expect(database.query).not.toHaveBeenCalled();
    });

    test('should return empty array for undefined email', async () => {
      const result = await StatementRequest.getByEmployee(undefined);
      expect(result).toEqual([]);
    });

    test('should return empty array for empty string email', async () => {
      const result = await StatementRequest.getByEmployee('');
      expect(result).toEqual([]);
    });
  });

  describe('getPendingForReminders', () => {
    test('should return pending/overdue requests needing reminders', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockPending = [
        { uuid: '1', status: 'pending', email_sent_at: '2025-01-01', uploaded_at: null }
      ];
      mockQuery(mockPending);

      const result = await StatementRequest.getPendingForReminders();

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'overdue')"),
        []
      );
      expect(result).toEqual(mockPending);
    });
  });

  describe('getDistinctBrokerages', () => {
    test('should return distinct brokerage names for an employee', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([
        { brokerage_name: 'Charles Schwab' },
        { brokerage_name: 'Interactive Brokers' }
      ]);

      const result = await StatementRequest.getDistinctBrokerages('emp@test.com');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT brokerage_name'),
        ['emp@test.com']
      );
      expect(result).toEqual(['Charles Schwab', 'Interactive Brokers']);
    });

    test('should return empty array for null email', async () => {
      const result = await StatementRequest.getDistinctBrokerages(null);
      expect(result).toEqual([]);
      expect(database.query).not.toHaveBeenCalled();
    });

    test('should return empty array for undefined email', async () => {
      const result = await StatementRequest.getDistinctBrokerages(undefined);
      expect(result).toEqual([]);
    });

    test('should lowercase the email', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      await StatementRequest.getDistinctBrokerages('USER@TEST.COM');

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        ['user@test.com']
      );
    });
  });

  describe('createSelfServiceRequest', () => {
    test('should create a self-service request without deadline or email', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockRow = {
        uuid: 'mock-stmt-uuid',
        period_year: 2025,
        period_month: 6,
        employee_email: 'emp@example.com',
        status: 'pending'
      };
      mockQuery([mockRow]);

      const data = {
        period_year: 2025,
        period_month: 6,
        employee_email: 'Emp@Example.com',
        employee_name: 'Jane Doe',
        brokerage_name: 'Fidelity'
      };

      const result = await StatementRequest.createSelfServiceRequest(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO statement_requests'),
        [
          'mock-stmt-uuid',
          2025,
          6,
          'emp@example.com',
          'Jane Doe',
          'pending',
          'mock-upload-token-hex',
          'Fidelity'
        ]
      );
      expect(result).toEqual(mockRow);
    });

    test('should return null on conflict (duplicate)', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const data = {
        period_year: 2025,
        period_month: 6,
        employee_email: 'emp@example.com'
      };

      const result = await StatementRequest.createSelfServiceRequest(data);
      expect(result).toBeNull();
    });

    test('should handle null optional fields', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-stmt-uuid' }]);

      const data = {
        period_year: 2025,
        period_month: 1,
        employee_email: 'test@example.com'
      };

      await StatementRequest.createSelfServiceRequest(data);

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null]) // employee_name and brokerage_name
      );
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.query.mockRejectedValueOnce(new Error('Insert error'));

      const data = {
        period_year: 2025,
        period_month: 1,
        employee_email: 'test@example.com'
      };

      await expect(
        StatementRequest.createSelfServiceRequest(data)
      ).rejects.toThrow('Insert error');
    });
  });
});
