const { sendText } = require('./evolutionApi');

async function sendNotification(phone, message) {
  if (!phone || !message) throw new Error('phone and message are required');
  await sendText(phone, message);
}

module.exports = { sendNotification };
