const mockPaymentCreate = jest.fn();
const mockSendText = jest.fn();
const mockSendImageBase64 = jest.fn();
const mockSendNotification = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetState = jest.fn();

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  Payment: jest.fn().mockImplementation(() => ({
    create: mockPaymentCreate,
  })),
}));

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendImageBase64: mockSendImageBase64,
  sendList: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/notify', () => ({ sendNotification: mockSendNotification }));

jest.mock('../src/state', () => ({
  setState: mockSetState,
  clearState: mockClearState,
  getState: mockGetState,
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));

process.env.MERCADOPAGO_ACCESS_TOKEN = 'test-token';

const { createPixCharge, handlePaymentFlow, handlePaymentWebhook } = require('../src/payment');

beforeEach(() => jest.clearAllMocks());

test('createPixCharge cria cobrança no Mercado Pago e retorna dados do Pix', async () => {
  mockPaymentCreate.mockResolvedValue({
    id: 12345,
    status: 'pending',
    point_of_interaction: {
      transaction_data: { qr_code_base64: 'base64img', qr_code: '00020101...' },
    },
  });
  const result = await createPixCharge('5511999999999', 50.00, 'Serviço Básico');
  expect(result).toEqual({ paymentId: 12345, qrCodeBase64: 'base64img', qrCodeText: '00020101...' });
  expect(mockPaymentCreate).toHaveBeenCalledWith({
    body: expect.objectContaining({
      transaction_amount: 50.00,
      description: 'Serviço Básico',
      payment_method_id: 'pix',
      external_reference: '5511999999999',
    }),
  });
});

test('handlePaymentFlow step 0 envia confirmação de valor', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 0, data: { amount: 50.00, description: 'Serviço Básico' } }, 'pagar');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('R$ 50,00'));
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 1 }));
});

test('handlePaymentFlow step 1 com "sim" gera Pix e envia QR code', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockSendImageBase64.mockResolvedValue(undefined);
  mockPaymentCreate.mockResolvedValue({
    id: 999,
    status: 'pending',
    point_of_interaction: {
      transaction_data: { qr_code_base64: 'imgbase64', qr_code: 'pixcode123' },
    },
  });
  await handlePaymentFlow(
    '5511999999999',
    { flow: 'payment', step: 1, data: { amount: 50.00, description: 'Serviço Básico' } },
    'sim'
  );
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('pixcode123'));
  expect(mockSendImageBase64).toHaveBeenCalledWith('5511999999999', 'imgbase64', expect.any(String));
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 2 }));
});

test('handlePaymentFlow step 1 com resposta diferente de "sim" cancela', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 1, data: { amount: 50, description: 'X' } }, 'não');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});

test('handlePaymentFlow step 2 retorna aviso de aguardando', async () => {
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 2, data: { paymentId: 999 } }, 'oi');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Aguardando'));
});

test('handlePaymentWebhook notifica cliente e limpa estado quando aprovado', async () => {
  mockGetState.mockResolvedValue({ flow: 'payment', step: 2, data: { paymentId: 999 } });
  mockClearState.mockResolvedValue(undefined);
  mockSendNotification.mockResolvedValue(undefined);
  await handlePaymentWebhook({ external_reference: '5511999999999' }, 'approved');
  expect(mockSendNotification).toHaveBeenCalledWith('5511999999999', expect.stringContaining('recebido'));
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});

test('handlePaymentWebhook ignora pagamentos não aprovados', async () => {
  await handlePaymentWebhook({ external_reference: '5511999999999' }, 'pending');
  expect(mockSendNotification).not.toHaveBeenCalled();
});

test('handlePaymentFlow "cancelar" limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 2, data: {} }, 'cancelar');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});
