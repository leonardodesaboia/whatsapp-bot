const mockSendText = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetCatalogCategories = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/state', () => ({
  getState: jest.fn(),
  setState: mockSetState,
  clearState: mockClearState,
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));

jest.mock('../src/config', () => ({
  getCatalogCategories: mockGetCatalogCategories,
}));

const MOCK_CATEGORIES = [
  {
    id: 1,
    slug: 'services',
    title: 'Serviços',
    position: 0,
    items: [
      { id: 10, category_id: 1, slug: 'basic', title: 'Serviço Básico', description: 'Desc', price: '50.00', duration: 60, position: 0 },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCatalogCategories.mockResolvedValue(MOCK_CATEGORIES);
});

const { getCategories, getCategory, getItem, handleCatalogFlow } = require('../src/catalog');

test('getCategories retorna todas as categorias', async () => {
  const cats = await getCategories();
  expect(cats).toHaveLength(1);
  expect(cats[0].slug).toBe('services');
});

test('getCategory retorna categoria por slug', async () => {
  expect((await getCategory('services')).title).toBe('Serviços');
  expect(await getCategory('nope')).toBeNull();
});

test('getItem retorna item por categorySlug e itemSlug', async () => {
  expect((await getItem('services', 'basic')).title).toBe('Serviço Básico');
  expect(await getItem('services', 'nope')).toBeNull();
  expect(await getItem('nope', 'basic')).toBeNull();
});

test('handleCatalogFlow step 0 envia lista numerada de categorias', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 0, data: {} }, 'menu');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', {
    flow: 'catalog', step: 1, data: { options: ['services'] },
  });
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('1. Serviços'));
});

test('handleCatalogFlow step 1 envia itens da categoria selecionada por número', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 1, data: { options: ['services'] } }, '1');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', {
    flow: 'catalog', step: 2, data: { categoryId: 'services', options: ['basic'] },
  });
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Serviço Básico'));
});

test('handleCatalogFlow step 1 rejeita número inválido', async () => {
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 1, data: { options: ['services'] } }, '5');
  expect(mockSetState).not.toHaveBeenCalled();
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('inválida'));
});

test('handleCatalogFlow step 2 mostra detalhes do item selecionado por número', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 2, data: { categoryId: 'services', options: ['basic'] } }, '1');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Serviço Básico'));
});

test('handleCatalogFlow "cancelar" limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 1, data: { options: ['services'] } }, 'cancelar');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});

test('handleCatalogFlow step 3 mantém fluxo em resposta inválida', async () => {
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow(
    '5511999999999',
    { flow: 'catalog', step: 3, data: { item: { title: 'Serviço Básico', price: '50.00', duration: 60 } } },
    'talvez'
  );
  expect(mockClearState).not.toHaveBeenCalled();
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Resposta inválida'));
});
