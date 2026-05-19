const { MercadoPagoConfig, Payment } = require('mercadopago');
const { sendText, sendImageBase64 } = require('./evolutionApi');
const { sendNotification } = require('./notify');
const { setState, clearState } = require('./state');

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

async function handlePaymentFlow(phone, state, text) {
  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Pagamento cancelado. Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    const { amount, description } = state.data;
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

async function handlePaymentWebhook(body, status) {
  if (status !== 'approved') return;
  const phone = body.external_reference;
  if (!phone) return;
  await sendNotification(phone, '✅ Pagamento recebido! Obrigado. Em breve entraremos em contato para confirmar os próximos passos.');
  await clearState(phone);
}

module.exports = { createPixCharge, handlePaymentFlow, handlePaymentWebhook };
