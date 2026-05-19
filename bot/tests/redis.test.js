const mockGet = jest.fn();
const mockSet = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: mockConnect,
    get: mockGet,
    set: mockSet,
  })),
}));

process.env.REDIS_URL = 'redis://localhost:6379';

const { getHistory, appendHistory } = require('../src/redis');

beforeEach(() => jest.clearAllMocks());

test('getHistory retorna array vazio quando não há histórico', async () => {
  mockGet.mockResolvedValue(null);
  const result = await getHistory('5511999999999');
  expect(result).toEqual([]);
  expect(mockGet).toHaveBeenCalledWith('history:5511999999999');
});

test('getHistory retorna histórico parseado do Redis', async () => {
  const history = [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }];
  mockGet.mockResolvedValue(JSON.stringify(history));
  const result = await getHistory('5511999999999');
  expect(result).toEqual(history);
});

test('appendHistory adiciona mensagens e salva com TTL de 24h', async () => {
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue('OK');
  await appendHistory('5511999999999', 'oi', 'olá');
  expect(mockSet).toHaveBeenCalledWith(
    'history:5511999999999',
    JSON.stringify([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ]),
    { EX: 86400 }
  );
});

test('appendHistory trunca ao limite de MAX_HISTORY pares', async () => {
  process.env.MAX_HISTORY = '2';
  const existing = [
    { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' },
  ];
  mockGet.mockResolvedValue(JSON.stringify(existing));
  mockSet.mockResolvedValue('OK');
  await appendHistory('5511999999999', 'e', 'f');
  const saved = JSON.parse(mockSet.mock.calls[0][1]);
  // 3 pares → trunca para 2 pares (4 mensagens), mantém as mais recentes
  expect(saved).toHaveLength(4);
  expect(saved[0]).toEqual({ role: 'user', content: 'c' });
  expect(saved[3]).toEqual({ role: 'assistant', content: 'f' });
  delete process.env.MAX_HISTORY;
});
