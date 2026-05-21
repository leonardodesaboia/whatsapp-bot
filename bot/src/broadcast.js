const { getContacts } = require('./config');
const { sendText } = require('./evolutionApi');

async function sendBroadcast(message) {
  const contacts = await getContacts();
  const delay = parseInt(process.env.BROADCAST_DELAY_MS || '1000', 10);
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    if (i > 0 && delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const phone = typeof contacts[i] === 'string' ? contacts[i] : contacts[i].phone;
    try {
      await sendText(phone, message);
      sent++;
    } catch (err) {
      console.error(`Erro ao enviar broadcast para ${phone}:`, err.message);
      failed++;
    }
  }

  return { sent, failed };
}

module.exports = { sendBroadcast };
