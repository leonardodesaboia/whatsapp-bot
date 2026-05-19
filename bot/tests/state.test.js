const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDel = jest.fn();
const mockClient = { get: mockGet, set: mockSet, del: mockDel };

jest.mock('../src/redis', () => ({
  getClient: jest.fn().mockResolvedValue(mockClient),
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
}));

process.env.HUMAN_TAKEOVER_TIMEOUT_MINUTES = '30';

const { getState, setState, clearState, setHumanMode, isHumanMode } = require('../src/state');

beforeEach(() => jest.clearAllMocks());

test('getState retorna estado padrão quando não há estado salvo', async () => {
  mockGet.mockResolvedValue(null);
  const state = await getState('5511999999999');
  expect(state).toEqual({ mode: 'bot', flow: null, step: 0, data: {} });
  expect(mockGet).toHaveBeenCalledWith('state:5511999999999');
});

test('getState retorna estado parseado do Redis', async () => {
  const saved = { mode: 'bot', flow: 'catalog', step: 1, data: { categoryId: 'services' } };
  mockGet.mockResolvedValue(JSON.stringify(saved));
  const state = await getState('5511999999999');
  expect(state).toEqual(saved);
});

test('setState faz merge do estado parcial com estado existente', async () => {
  const existing = { mode: 'bot', flow: 'catalog', step: 1, data: { categoryId: 'services' } };
  mockGet.mockResolvedValue(JSON.stringify(existing));
  mockSet.mockResolvedValue('OK');
  await setState('5511999999999', { step: 2, data: { categoryId: 'services', itemId: 'basic' } });
  expect(mockSet).toHaveBeenCalledWith(
    'state:5511999999999',
    JSON.stringify({ mode: 'bot', flow: 'catalog', step: 2, data: { categoryId: 'services', itemId: 'basic' } }),
    { EX: 86400 }
  );
});

test('setState aceita TTL customizado', async () => {
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue('OK');
  await setState('5511999999999', { mode: 'human' }, 1800);
  expect(mockSet.mock.calls[0][2]).toEqual({ EX: 1800 });
});

test('clearState deleta a chave do Redis', async () => {
  mockDel.mockResolvedValue(1);
  await clearState('5511999999999');
  expect(mockDel).toHaveBeenCalledWith('state:5511999999999');
});

test('setHumanMode define mode=human com TTL de 30 minutos', async () => {
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue('OK');
  await setHumanMode('5511999999999');
  const saved = JSON.parse(mockSet.mock.calls[0][1]);
  expect(saved.mode).toBe('human');
  expect(saved.flow).toBeNull();
  expect(mockSet.mock.calls[0][2]).toEqual({ EX: 1800 });
});

test('isHumanMode retorna true quando mode é human', async () => {
  mockGet.mockResolvedValue(JSON.stringify({ mode: 'human', flow: null, step: 0, data: {} }));
  expect(await isHumanMode('5511999999999')).toBe(true);
});

test('isHumanMode retorna false quando mode é bot', async () => {
  mockGet.mockResolvedValue(null);
  expect(await isHumanMode('5511999999999')).toBe(false);
});
