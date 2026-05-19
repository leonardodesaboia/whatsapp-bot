const mockCreate = jest.fn();

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }))
);

jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      nome: 'Empresa Teste',
      descricao: 'Empresa de tecnologia.',
      horario: '9h às 18h',
      contato: 'teste@teste.com',
      faq: [{ pergunta: 'Qual o prazo?', resposta: '5 dias úteis.' }],
    })
  ),
}));

process.env.OPENAI_API_KEY = 'test-key';

const { chat, buildSystemPrompt, chatWithImage } = require('../src/openai');

beforeEach(() => jest.clearAllMocks());

test('buildSystemPrompt inclui nome e FAQ da empresa', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('Empresa Teste');
  expect(prompt).toContain('Qual o prazo?');
  expect(prompt).toContain('5 dias úteis.');
});

test('buildSystemPrompt instrui o bot a responder só sobre a empresa', () => {
  const prompt = buildSystemPrompt();
  expect(prompt.toLowerCase()).toMatch(/responda apenas|somente/);
});

test('chat chama OpenAI com system prompt, histórico e mensagem do usuário', async () => {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'São 5 dias úteis.' } }],
  });
  const history = [
    { role: 'user', content: 'oi' },
    { role: 'assistant', content: 'Olá! Como posso ajudar?' },
  ];
  const result = await chat(history, 'Qual o prazo de entrega?');
  expect(result).toBe('São 5 dias úteis.');
  const call = mockCreate.mock.calls[0][0];
  expect(call.messages[0].role).toBe('system');
  expect(call.messages[1]).toEqual({ role: 'user', content: 'oi' });
  expect(call.messages[call.messages.length - 1]).toEqual({
    role: 'user',
    content: 'Qual o prazo de entrega?',
  });
});

test('chat usa o modelo definido em OPENAI_MODEL', async () => {
  process.env.OPENAI_MODEL = 'gpt-4o';
  mockCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
  await chat([], 'teste');
  expect(mockCreate.mock.calls[0][0].model).toBe('gpt-4o');
  delete process.env.OPENAI_MODEL;
});

test('chatWithImage envia imagem base64 para GPT-4o e retorna resposta', async () => {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'Vejo uma imagem de produto de beleza.' } }],
  });
  const result = await chatWithImage('base64data', 'O que é isso?');
  expect(result).toBe('Vejo uma imagem de produto de beleza.');
  const call = mockCreate.mock.calls[0][0];
  expect(call.model).toBe('gpt-4o');
  expect(call.messages[0].role).toBe('system');
  const userContent = call.messages[1].content;
  expect(userContent).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'image_url' }),
      expect.objectContaining({ type: 'text', text: 'O que é isso?' }),
    ])
  );
});

test('chatWithImage retorna fallback quando OpenAI não retorna choices', async () => {
  mockCreate.mockResolvedValue({ choices: [] });
  const result = await chatWithImage('base64data', '');
  expect(result).toBe('Não consegui analisar a imagem.');
});
