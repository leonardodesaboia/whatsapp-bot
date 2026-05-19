const fs = require('fs');
const path = require('path');
const { sendText } = require('./evolutionApi');

function loadContacts() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../contacts.json'), 'utf8')
  );
  return data.contacts || [];
}

async function sendBroadcast(message) {
  const contacts = loadContacts();
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

module.exports = { loadContacts, sendBroadcast };
