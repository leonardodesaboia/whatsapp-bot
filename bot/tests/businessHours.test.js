const mockGetCompanySettings = jest.fn();

jest.mock('../src/config', () => ({
  getCompanySettings: mockGetCompanySettings,
}));

const { isOpen, getClosedMessage } = require('../src/businessHours');

beforeEach(() => jest.clearAllMocks());

test('getClosedMessage retorna a mensagem configurada', async () => {
  mockGetCompanySettings.mockResolvedValue({ closed_message: 'Estamos fechados!' });
  expect(await getClosedMessage()).toBe('Estamos fechados!');
});

test('getClosedMessage retorna fallback quando company_settings está vazio', async () => {
  mockGetCompanySettings.mockResolvedValue(null);
  const msg = await getClosedMessage();
  expect(typeof msg).toBe('string');
  expect(msg.length).toBeGreaterThan(0);
});

test('isOpen retorna true quando business_hours é null (24h)', async () => {
  mockGetCompanySettings.mockResolvedValue({ business_hours: null });
  expect(await isOpen()).toBe(true);
});

test('isOpen retorna true quando company_settings está vazio', async () => {
  mockGetCompanySettings.mockResolvedValue(null);
  expect(await isOpen()).toBe(true);
});

test('isOpen retorna false quando dia não tem horário configurado', async () => {
  mockGetCompanySettings.mockResolvedValue({
    timezone: 'America/Sao_Paulo',
    business_hours: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
  });
  expect(await isOpen()).toBe(false);
});

test('isOpen retorna boolean', async () => {
  mockGetCompanySettings.mockResolvedValue({
    timezone: 'America/Sao_Paulo',
    business_hours: {
      mon: { open: '09:00', close: '18:00' },
      tue: { open: '09:00', close: '18:00' },
      wed: { open: '09:00', close: '18:00' },
      thu: { open: '09:00', close: '18:00' },
      fri: { open: '09:00', close: '18:00' },
      sat: null,
      sun: null,
    },
  });
  const result = await isOpen();
  expect(typeof result).toBe('boolean');
});
