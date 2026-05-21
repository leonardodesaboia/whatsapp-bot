const mockEventsList = jest.fn();
const mockEventsInsert = jest.fn();
const mockEventsDelete = jest.fn();
const mockSendText = jest.fn();
const mockSendNotification = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetState = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisKeys = jest.fn();
const mockRedisClient = { set: mockRedisSet, del: mockRedisDel, keys: mockRedisKeys, get: jest.fn() };
const mockGetCompanySettings = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        list: mockEventsList,
        insert: mockEventsInsert,
        delete: mockEventsDelete,
      },
    }),
  },
}));

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/notify', () => ({ sendNotification: mockSendNotification }));

jest.mock('../src/state', () => ({
  getState: mockGetState,
  setState: mockSetState,
  clearState: mockClearState,
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));

jest.mock('../src/redis', () => ({
  getClient: jest.fn().mockResolvedValue(mockRedisClient),
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
}));

jest.mock('../src/config', () => ({
  getCompanySettings: mockGetCompanySettings,
}));

process.env.GOOGLE_CALENDAR_ID = 'test@calendar.google.com';
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/fake/credentials.json';

const { createAppointment, cancelAppointment, handleSchedulingFlow } = require('../src/scheduling');

beforeEach(() => {
  jest.clearAllMocks();
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
});

test('createAppointment insere evento no Google Calendar e retorna eventId', async () => {
  mockEventsInsert.mockResolvedValue({ data: { id: 'evt-123' } });
  mockRedisSet.mockResolvedValue('OK');
  const id = await createAppointment('5511999999999', 'Corte', new Date('2026-06-10T10:00:00'), 60);
  expect(mockEventsInsert).toHaveBeenCalled();
  expect(id).toBe('evt-123');
});

test('cancelAppointment deleta evento do Google Calendar', async () => {
  mockEventsDelete.mockResolvedValue({});
  await cancelAppointment('evt-123');
  expect(mockEventsDelete).toHaveBeenCalledWith(
    expect.objectContaining({ calendarId: 'test@calendar.google.com', eventId: 'evt-123' })
  );
});

test('handleSchedulingFlow step 0 sem service pede nome do serviço', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 0, data: {} }, 'quero agendar');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('serviço'));
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 1 }));
});

test('handleSchedulingFlow step 0 com service pula para mostrar slots', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsList.mockResolvedValue({ data: { items: [] } });
  await handleSchedulingFlow(
    '5511999999999',
    { flow: 'scheduling', step: 0, data: { service: 'Corte', duration: 60 } },
    'agendar'
  );
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('horário'));
});

test('handleSchedulingFlow step 1 salva serviço e mostra slots', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsList.mockResolvedValue({ data: { items: [] } });
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 1, data: {} }, 'Corte de cabelo');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 2 }));
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('horário'));
});

test('handleSchedulingFlow step 3 com "sim" cria agendamento e limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsInsert.mockResolvedValue({ data: { id: 'evt-456' } });
  mockRedisSet.mockResolvedValue('OK');
  mockSendNotification.mockResolvedValue(undefined);
  const slot = new Date('2026-06-10T10:00:00');
  await handleSchedulingFlow(
    '5511999999999',
    { flow: 'scheduling', step: 3, data: { service: 'Corte', slot, duration: 60, slots: [slot] } },
    'sim'
  );
  expect(mockEventsInsert).toHaveBeenCalled();
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('confirmado'));
});

test('handleSchedulingFlow "cancelar" limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 2, data: {} }, 'cancelar');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});
