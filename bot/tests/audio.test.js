const mockGetMediaBase64 = jest.fn();
const mockTranscriptionsCreate = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: jest.fn(),
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: mockGetMediaBase64,
}));

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockTranscriptionsCreate } },
  }))
);

process.env.OPENAI_API_KEY = 'test-key';
process.env.WHISPER_LANGUAGE = 'pt';

const { transcribeAudio } = require('../src/audio');

beforeEach(() => jest.clearAllMocks());

test('transcribeAudio retorna texto transcrito', async () => {
  mockGetMediaBase64.mockResolvedValue('base64audiodata');
  mockTranscriptionsCreate.mockResolvedValue({ text: 'quero agendar um horário' });
  const messageData = { key: { id: 'msg-1' }, message: { audioMessage: {} } };
  const result = await transcribeAudio(messageData);
  expect(result).toBe('quero agendar um horário');
  expect(mockGetMediaBase64).toHaveBeenCalledWith(messageData);
  expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'whisper-1', language: 'pt' })
  );
});

test('transcribeAudio retorna null quando getMediaBase64 falha', async () => {
  mockGetMediaBase64.mockRejectedValue(new Error('network error'));
  const result = await transcribeAudio({ message: { audioMessage: {} } });
  expect(result).toBeNull();
});

test('transcribeAudio retorna null quando Whisper falha', async () => {
  mockGetMediaBase64.mockResolvedValue('base64audiodata');
  mockTranscriptionsCreate.mockRejectedValue(new Error('whisper error'));
  const result = await transcribeAudio({ message: { audioMessage: {} } });
  expect(result).toBeNull();
});
