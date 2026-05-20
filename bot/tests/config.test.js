const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

process.env.DATABASE_URL = 'postgresql://test';

const { getCompanySettings, getCatalogCategories, getContacts } = require('../src/config');

beforeEach(() => jest.clearAllMocks());

test('getCompanySettings retorna a primeira linha da tabela company_settings', async () => {
  mockQuery.mockResolvedValue({
    rows: [{ id: 1, nome: 'Empresa Teste', faq: [], business_hours: null }],
  });
  const result = await getCompanySettings();
  expect(result.nome).toBe('Empresa Teste');
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM company_settings LIMIT 1'
  );
});

test('getCompanySettings retorna null quando tabela está vazia', async () => {
  mockQuery.mockResolvedValue({ rows: [] });
  const result = await getCompanySettings();
  expect(result).toBeNull();
});

test('getCatalogCategories retorna categorias com itens aninhados', async () => {
  mockQuery
    .mockResolvedValueOnce({
      rows: [{ id: 1, slug: 'services', title: 'Serviços', position: 0 }],
    })
    .mockResolvedValueOnce({
      rows: [
        { id: 10, category_id: 1, slug: 'basic', title: 'Básico', description: '', price: '50.00', duration: 60, position: 0 },
      ],
    });
  const result = await getCatalogCategories();
  expect(result).toHaveLength(1);
  expect(result[0].slug).toBe('services');
  expect(result[0].items).toHaveLength(1);
  expect(result[0].items[0].slug).toBe('basic');
});

test('getCatalogCategories retorna array vazio quando não há categorias', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  const result = await getCatalogCategories();
  expect(result).toEqual([]);
});

test('getContacts retorna lista de contatos', async () => {
  mockQuery.mockResolvedValue({
    rows: [{ phone: '5511999999999', name: 'João' }],
  });
  const result = await getContacts();
  expect(result).toHaveLength(1);
  expect(result[0].phone).toBe('5511999999999');
});
