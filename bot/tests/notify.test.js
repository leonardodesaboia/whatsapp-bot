const mockSendText = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  registerWebhook: jest.fn(),
  sendList: jest.fn(),
}));

const { sendNotification } = require('../src/notify');

beforeEach(() => jest.clearAllMocks());

test('sendNotification chama sendText com phone e message', async () => {
  mockSendText.mockResolvedValue(undefined);
  await sendNotification('5511999999999', 'Seu pedido chegou!');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Seu pedido chegou!');
});

test('sendNotification lança erro quando phone é vazio', async () => {
  await expect(sendNotification('', 'mensagem')).rejects.toThrow('phone and message are required');
});

test('sendNotification lança erro quando message é vazio', async () => {
  await expect(sendNotification('5511999999999', '')).rejects.toThrow('phone and message are required');
});

test('sendNotification propaga erros do sendText', async () => {
  mockSendText.mockRejectedValue(new Error('network error'));
  await expect(sendNotification('5511999999999', 'msg')).rejects.toThrow('network error');
});
