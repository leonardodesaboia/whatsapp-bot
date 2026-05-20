const mockSendText = jest.fn();
const mockSendList = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetCatalogCategories = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: mockSendList,
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

const {
  getCategories,
  getCategory,
  getItem,
  buildCategoryListMessage,
  buildItemListMessage,
  handleCatalogFlow,
} = require('../src/catalog');

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

test('buildCategoryListMessage retorna estrutura de list message com slug como rowId', async () => {
  const msg = await buildCategoryListMessage();
  expect(msg.sections[0].rows[0].rowId).toBe('services');
  expect(msg.sections[0].rows[0].title).toBe('Serviços');
});

test('buildItemListMessage retorna itens da categoria com rowId "catSlug:itemSlug"', async () => {
  const msg = await buildItemListMessage('services');
  expect(msg.sections[0].rows[0].rowId).toBe('services:basic');
  expect(msg.sections[0].rows[0].title).toBe('Serviço Básico');
});

test('buildItemListMessage retorna null para categoria inválida', async () => {
  expect(await buildItemListMessage('nope')).toBeNull();
});

test('handleCatalogFlow step 0 envia list message de categorias', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendList.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 0, data: {} }, 'menu');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', { flow: 'catalog', step: 1, data: {} });
  expect(mockSendList).toHaveBeenCalled();
});

test('handleCatalogFlow step 1 envia itens da categoria selecionada', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendList.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 1, data: {} }, 'services');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', { flow: 'catalog', step: 2, data: { categoryId: 'services' } });
  expect(mockSendList).toHaveBeenCalled();
});

test('handleCatalogFlow step 2 mostra detalhes do item selecionado', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 2, data: { categoryId: 'services' } }, 'services:basic');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Serviço Básico'));
});

test('handleCatalogFlow "cancelar" limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 1, data: {} }, 'cancelar');
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
