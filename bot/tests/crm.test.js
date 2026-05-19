const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/crm';

const { upsertLead, addInteraction } = require('../src/crm');

beforeEach(() => jest.clearAllMocks());

test('upsertLead consulta primeira etapa e faz upsert do lead', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({ rows: [] });

  await upsertLead('5511999999999', 'João', 'Olá');

  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('SELECT id FROM stages'),
    []
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('INSERT INTO leads'),
    ['5511999999999', 'João', 'Olá', 1]
  );
});

test('upsertLead usa stage_id null quando não há etapas', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  await upsertLead('5511999999999', null, 'Olá');

  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('INSERT INTO leads'),
    ['5511999999999', null, 'Olá', null]
  );
});

test('upsertLead não lança erro quando PostgreSQL falha', async () => {
  mockQuery.mockRejectedValue(new Error('connection refused'));
  await expect(upsertLead('5511999999999', 'João', 'Olá')).resolves.not.toThrow();
});

test('addInteraction insere interação pelo phone do lead', async () => {
  mockQuery.mockResolvedValue({ rows: [] });

  await addInteraction('5511999999999', 'Olá', 'in', 'text');

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interactions'),
    ['5511999999999', 'Olá', 'in', 'text']
  );
});

test('addInteraction não lança erro quando PostgreSQL falha', async () => {
  mockQuery.mockRejectedValue(new Error('connection refused'));
  await expect(addInteraction('5511999999999', 'Olá', 'in', 'text')).resolves.not.toThrow();
});
