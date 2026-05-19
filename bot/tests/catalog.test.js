const mockSendText = jest.fn();
const mockSendList = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();

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

jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      categories: [
        {
          id: 'services',
          title: 'Serviços',
          items: [
            { id: 'basic', title: 'Serviço Básico', description: 'Desc', price: 50.00, duration: 60 },
          ],
        },
      ],
    })
  ),
}));

const {
  getCategories,
  getCategory,
  getItem,
  buildCategoryListMessage,
  buildItemListMessage,
  handleCatalogFlow,
} = require('../src/catalog');

beforeEach(() => jest.clearAllMocks());

test('getCategories retorna todas as categorias', () => {
  expect(getCategories()).toHaveLength(1);
  expect(getCategories()[0].id).toBe('services');
});

test('getCategory retorna categoria por id', () => {
  expect(getCategory('services').title).toBe('Serviços');
  expect(getCategory('nope')).toBeNull();
});

test('getItem retorna item por categoryId e itemId', () => {
  expect(getItem('services', 'basic').title).toBe('Serviço Básico');
  expect(getItem('services', 'nope')).toBeNull();
  expect(getItem('nope', 'basic')).toBeNull();
});

test('buildCategoryListMessage retorna estrutura de list message', () => {
  const msg = buildCategoryListMessage();
  expect(msg.sections[0].rows[0].rowId).toBe('services');
  expect(msg.sections[0].rows[0].title).toBe('Serviços');
});

test('buildItemListMessage retorna itens da categoria', () => {
  const msg = buildItemListMessage('services');
  expect(msg.sections[0].rows[0].rowId).toBe('services:basic');
  expect(msg.sections[0].rows[0].title).toBe('Serviço Básico');
});

test('buildItemListMessage retorna null para categoria inválida', () => {
  expect(buildItemListMessage('nope')).toBeNull();
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
    {
      flow: 'catalog',
      step: 3,
      data: { item: { title: 'Serviço Básico', price: 50, duration: 60 } },
    },
    'talvez'
  );
  expect(mockClearState).not.toHaveBeenCalled();
  expect(mockSendText).toHaveBeenCalledWith(
    '5511999999999',
    expect.stringContaining('Resposta inválida')
  );
});
