const mockSendText = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      contacts: [
        { phone: '5511999999999', name: 'João' },
        { phone: '5511888888888', name: 'Maria' },
      ],
    })
  ),
}));

process.env.BROADCAST_DELAY_MS = '0';

const { loadContacts, sendBroadcast } = require('../src/broadcast');

beforeEach(() => jest.clearAllMocks());

test('loadContacts retorna lista de contatos do contacts.json', () => {
  const contacts = loadContacts();
  expect(contacts).toHaveLength(2);
  expect(contacts[0]).toEqual({ phone: '5511999999999', name: 'João' });
  expect(contacts[1]).toEqual({ phone: '5511888888888', name: 'Maria' });
});

test('sendBroadcast envia mensagem para todos os contatos e retorna contadores', async () => {
  mockSendText.mockResolvedValue(undefined);
  const result = await sendBroadcast('Promoção especial!');
  expect(mockSendText).toHaveBeenCalledTimes(2);
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Promoção especial!');
  expect(mockSendText).toHaveBeenCalledWith('5511888888888', 'Promoção especial!');
  expect(result).toEqual({ sent: 2, failed: 0 });
});

test('sendBroadcast conta falhas sem interromper envio para os demais', async () => {
  mockSendText
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('timeout'));
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 1, failed: 1 });
});

test('sendBroadcast retorna { sent: 0, failed: 0 } para lista vazia', async () => {
  const fs = require('fs');
  fs.readFileSync.mockReturnValueOnce(JSON.stringify({ contacts: [] }));
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 0, failed: 0 });
  expect(mockSendText).not.toHaveBeenCalled();
});
