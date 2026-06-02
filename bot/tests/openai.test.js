const mockCreate = jest.fn();
const mockGetCompanySettings = jest.fn();

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    audio: { transcriptions: { create: jest.fn() } },
  }))
);

jest.mock('../src/config', () => ({
  getCompanySettings: mockGetCompanySettings,
}));

process.env.OPENAI_API_KEY = 'test-key';

const { chat, buildSystemPrompt, chatWithImage, formatBusinessHours } = require('../src/openai');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCompanySettings.mockResolvedValue({
    nome: 'Empresa Teste',
    descricao: 'Empresa de tecnologia.',
    contato: 'teste@teste.com',
    faq: [{ pergunta: 'Qual o prazo?', resposta: '5 dias úteis.' }],
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

test('formatBusinessHours formata dias consecutivos com mesmo horário', () => {
  const bh = {
    mon: { open: '09:00', close: '18:00' },
    tue: { open: '09:00', close: '18:00' },
    wed: { open: '09:00', close: '18:00' },
    thu: { open: '09:00', close: '18:00' },
    fri: { open: '09:00', close: '18:00' },
    sat: null,
    sun: null,
  };
  expect(formatBusinessHours(bh)).toBe('Seg–Sex 09:00–18:00');
});

test('formatBusinessHours retorna "24 horas" quando business_hours é null', () => {
  expect(formatBusinessHours(null)).toBe('24 horas');
});

test('formatBusinessHours retorna "Fechado" quando nenhum dia está ativo', () => {
  expect(formatBusinessHours({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null })).toBe('Fechado');
});

test('buildSystemPrompt inclui nome e FAQ da empresa', async () => {
  const prompt = await buildSystemPrompt();
  expect(prompt).toContain('Empresa Teste');
  expect(prompt).toContain('Qual o prazo?');
  expect(prompt).toContain('5 dias úteis.');
});

test('buildSystemPrompt instrui o bot a responder só sobre a empresa', async () => {
  const prompt = await buildSystemPrompt();
  expect(prompt.toLowerCase()).toMatch(/responda apenas|somente/);
});

test('buildSystemPrompt permite agendamento simples de reunião', async () => {
  const prompt = await buildSystemPrompt();
  expect(prompt).toContain('__SCHEDULE__');
  expect(prompt.toLowerCase()).toContain('reunião');
  expect(prompt.toLowerCase()).toContain('não exija produto');
});

test('buildSystemPrompt retorna fallback quando company_settings está vazio', async () => {
  mockGetCompanySettings.mockResolvedValue(null);
  const prompt = await buildSystemPrompt();
  expect(typeof prompt).toBe('string');
  expect(prompt.length).toBeGreaterThan(0);
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
  const userContent = call.messages[1].content;
  expect(userContent).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'image_url' }),
      expect.objectContaining({ type: 'text', text: 'O que é isso?' }),
    ])
  );
});

test('chatWithImage usa prompt humanizado quando não há caption', async () => {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'Olá! Como posso ajudar?' } }],
  });
  await chatWithImage('base64data', '');
  const call = mockCreate.mock.calls[0][0];
  const userContent = call.messages[1].content;
  const textPart = userContent.find((c) => c.type === 'text');
  expect(textPart.text).toContain('atendente humano');
});

test('chatWithImage retorna fallback quando OpenAI não retorna choices', async () => {
  mockCreate.mockResolvedValue({ choices: [] });
  const result = await chatWithImage('base64data', '');
  expect(result).toBe('Não consegui analisar a imagem.');
});
