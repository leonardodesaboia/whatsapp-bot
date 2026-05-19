const mockGetMediaBase64 = jest.fn();
const mockSendText = jest.fn();
const mockChatWithImage = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  getMediaBase64: mockGetMediaBase64,
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/openai', () => ({
  chat: jest.fn(),
  buildSystemPrompt: jest.fn(),
  chatWithImage: mockChatWithImage,
}));

const { handleImageMessage } = require('../src/image');

beforeEach(() => jest.clearAllMocks());

test('handleImageMessage obtém base64, descreve imagem e envia resposta', async () => {
  mockGetMediaBase64.mockResolvedValue('base64imagedata');
  mockChatWithImage.mockResolvedValue('Vejo uma imagem de produto.');
  mockSendText.mockResolvedValue(undefined);
  const messageData = { message: { imageMessage: { caption: 'O que é isso?' } } };
  await handleImageMessage('5511999999999', messageData);
  expect(mockGetMediaBase64).toHaveBeenCalledWith(messageData);
  expect(mockChatWithImage).toHaveBeenCalledWith('base64imagedata', 'O que é isso?');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Vejo uma imagem de produto.');
});

test('handleImageMessage usa caption vazia quando imageMessage não tem legenda', async () => {
  mockGetMediaBase64.mockResolvedValue('base64imagedata');
  mockChatWithImage.mockResolvedValue('Resposta');
  mockSendText.mockResolvedValue(undefined);
  const messageData = { message: { imageMessage: {} } };
  await handleImageMessage('5511999999999', messageData);
  expect(mockChatWithImage).toHaveBeenCalledWith('base64imagedata', '');
});

test('handleImageMessage não lança erro quando getMediaBase64 falha', async () => {
  mockGetMediaBase64.mockRejectedValue(new Error('network error'));
  await expect(handleImageMessage('5511999999999', { message: { imageMessage: {} } })).resolves.not.toThrow();
  expect(mockSendText).not.toHaveBeenCalled();
});
