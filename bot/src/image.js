const { getMediaBase64, sendText } = require('./evolutionApi');
const { chatWithImage } = require('./openai');

async function handleImageMessage(phone, messageData) {
  try {
    const base64 = await getMediaBase64(messageData);
    const caption = messageData.message?.imageMessage?.caption || '';
    const reply = await chatWithImage(base64, caption);
    await sendText(phone, reply);
  } catch (err) {
    console.error('Erro ao processar imagem:', err.message);
  }
}

module.exports = { handleImageMessage };
