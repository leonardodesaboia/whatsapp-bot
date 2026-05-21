const mockQuery = jest.fn();
const mockSendText = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: jest.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test';

const { processRemarketing, cancelEnrollment } = require('../src/remarketing');

beforeEach(() => jest.clearAllMocks());

test('processRemarketing envia mensagem quando step está vencido', async () => {
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: yesterday, phone: '5511999999999', name: 'João' }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Oi {{nome}}, tudo bem?' }] })
    .mockResolvedValueOnce({ rows: [] });
  await processRemarketing();
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Oi João, tudo bem?');
});

test('processRemarketing não envia quando step ainda não está vencido', async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: twoHoursAgo, phone: '5511999', name: 'Ana' }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Oi {{nome}}' }] });
  await processRemarketing();
  expect(mockSendText).not.toHaveBeenCalled();
});

test('processRemarketing substitui {{nome}} por "cliente" quando nome é null', async () => {
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: yesterday, phone: '5511999', name: null }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Oi {{nome}}!' }] })
    .mockResolvedValueOnce({ rows: [] });
  await processRemarketing();
  expect(mockSendText).toHaveBeenCalledWith('5511999', 'Oi cliente!');
});

test('processRemarketing adiciona tag e completa enrollment no último step', async () => {
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: yesterday, phone: '5511999', name: 'Maria' }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Última mensagem' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  await processRemarketing();
  expect(mockSendText).toHaveBeenCalled();
  const completedCall = mockQuery.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('completed_at'));
  expect(completedCall).toBeDefined();
  const tagCall = mockQuery.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('sem-resposta'));
  expect(tagCall).toBeDefined();
  expect(tagCall[1]).toContain(5);
});

test('processRemarketing enrola lead elegível', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [{ id: 42 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  await processRemarketing();
  const insertCall = mockQuery.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('INSERT INTO remarketing_enrollments'));
  expect(insertCall).toBeDefined();
  expect(insertCall[1]).toEqual([1, 42]);
});

test('cancelEnrollment define cancelled_at para o lead', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await cancelEnrollment('5511999999999');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('cancelled_at = NOW()'),
    ['5511999999999']
  );
});

test('cancelEnrollment não lança exceção quando não há enrollment ativo', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await expect(cancelEnrollment('5511999999999')).resolves.not.toThrow();
});
