const mockSendText = jest.fn();
const mockGetContacts = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: jest.fn(),
}));

jest.mock('../src/config', () => ({
  getContacts: mockGetContacts,
}));

process.env.BROADCAST_DELAY_MS = '0';

const { sendBroadcast } = require('../src/broadcast');

beforeEach(() => jest.clearAllMocks());

test('sendBroadcast envia mensagem para todos os contatos e retorna contadores', async () => {
  mockGetContacts.mockResolvedValue([
    { phone: '5511999999999', name: 'João' },
    { phone: '5511888888888', name: 'Maria' },
  ]);
  mockSendText.mockResolvedValue(undefined);
  const result = await sendBroadcast('Promoção especial!');
  expect(mockSendText).toHaveBeenCalledTimes(2);
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Promoção especial!');
  expect(mockSendText).toHaveBeenCalledWith('5511888888888', 'Promoção especial!');
  expect(result).toEqual({ sent: 2, failed: 0 });
});

test('sendBroadcast conta falhas sem interromper envio para os demais', async () => {
  mockGetContacts.mockResolvedValue([
    { phone: '5511999999999', name: 'João' },
    { phone: '5511888888888', name: 'Maria' },
  ]);
  mockSendText
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('timeout'));
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 1, failed: 1 });
});

test('sendBroadcast retorna { sent: 0, failed: 0 } para lista vazia', async () => {
  mockGetContacts.mockResolvedValue([]);
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 0, failed: 0 });
  expect(mockSendText).not.toHaveBeenCalled();
});
