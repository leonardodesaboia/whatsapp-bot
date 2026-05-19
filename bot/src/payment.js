const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { sendText, sendImageBase64 } = require('./evolutionApi');
const { sendNotification } = require('./notify');
const { getState, setState, clearState } = require('./state');

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

async function createPixCharge(phone, amount, description) {
  const payment = new Payment(mpClient);
  const result = await payment.create({
    body: {
      transaction_amount: amount,
      description,
      payment_method_id: 'pix',
      external_reference: phone,
      payer: { email: `${phone}@whatsapp.bot` },
    },
  });
  return {
    paymentId: result.id,
    qrCodeBase64: result.point_of_interaction.transaction_data.qr_code_base64,
    qrCodeText: result.point_of_interaction.transaction_data.qr_code,
  };
}

function extractPaymentIdFromNotification(body, query = {}) {
  return query['data.id'] || body?.data?.id || null;
}

function parseSignatureHeader(signatureHeader) {
  if (!signatureHeader) return {};

  return signatureHeader.split(',').reduce((parts, chunk) => {
    const [rawKey, ...rawValue] = chunk.split('=');
    if (!rawKey || rawValue.length === 0) return parts;

    parts[rawKey.trim()] = rawValue.join('=').trim();
    return parts;
  }, {});
}

function verifyWebhookSignature({ secret, signatureHeader, requestId, dataId }) {
  if (!secret || !signatureHeader || !requestId || !dataId) {
    return false;
  }

  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  if (!ts || !v1) {
    return false;
  }

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  if (expected.length !== v1.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

async function handlePaymentFlow(phone, state, text) {
  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Pagamento cancelado. Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    const { amount, description } = state.data;
    if (!Number.isFinite(amount) || amount <= 0 || !description) {
      await clearState(phone);
      await sendText(phone, 'Não consegui identificar os dados do pagamento. Informe o valor e a descrição novamente.');
      return;
    }
    await setState(phone, { ...state, step: 1 });
    await sendText(
      phone,
      `Gerar Pix de *R$ ${amount.toFixed(2).replace('.', ',')}* para *${description}*?\n\nDigite "sim" para confirmar ou "cancelar".`
    );
    return;
  }

  if (state.step === 1) {
    if (text?.toLowerCase() !== 'sim') {
      await clearState(phone);
      await sendText(phone, 'Pagamento cancelado. Como posso ajudar?');
      return;
    }
    const { amount, description } = state.data;
    if (!Number.isFinite(amount) || amount <= 0 || !description) {
      await clearState(phone);
      await sendText(phone, 'Não consegui identificar os dados do pagamento. Informe o valor e a descrição novamente.');
      return;
    }
    const { paymentId, qrCodeBase64, qrCodeText } = await createPixCharge(phone, amount, description);
    await setState(phone, { ...state, step: 2, data: { ...state.data, paymentId } });
    await sendText(phone, `📋 *Pix copia e cola:*\n\n${qrCodeText}\n\nPix válido por 30 minutos.`);
    await sendImageBase64(phone, qrCodeBase64, 'QR Code Pix');
    return;
  }

  if (state.step === 2) {
    await sendText(phone, 'Aguardando confirmação do seu Pix. Digite "cancelar" para desistir.');
  }
}

async function handlePaymentWebhook(body, query = {}) {
  if (body?.type && body.type !== 'payment') return false;

  const notificationPaymentId = extractPaymentIdFromNotification(body, query);
  if (!notificationPaymentId) return false;

  const payment = new Payment(mpClient);
  const paymentDetails = await payment.get({ id: notificationPaymentId });
  if (paymentDetails.status !== 'approved') return false;

  const phone = paymentDetails.external_reference;
  if (!phone) return false;

  const state = await getState(phone);
  const expectedPaymentId = state?.data?.paymentId;
  if (state?.flow !== 'payment' || String(expectedPaymentId) !== String(paymentDetails.id)) {
    console.warn('Webhook de pagamento ignorado: estado pendente não confere com o pagamento aprovado.');
    return false;
  }

  await sendNotification(phone, '✅ Pagamento recebido! Obrigado. Em breve entraremos em contato para confirmar os próximos passos.');
  await clearState(phone);
  return true;
}

module.exports = {
  createPixCharge,
  extractPaymentIdFromNotification,
  verifyWebhookSignature,
  handlePaymentFlow,
  handlePaymentWebhook,
};
