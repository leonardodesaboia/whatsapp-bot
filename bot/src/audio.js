const OpenAI = require('openai');
const { getMediaBase64 } = require('./evolutionApi');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudio(messageData) {
  try {
    const base64 = await getMediaBase64(messageData);
    const buffer = Buffer.from(base64, 'base64');
    const file = new File([buffer], 'audio.ogg', { type: 'audio/ogg; codecs=opus' });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: process.env.WHISPER_LANGUAGE || 'pt',
    });
    return transcription.text;
  } catch (err) {
    console.error('Erro ao transcrever áudio:', err.message);
    return null;
  }
}

module.exports = { transcribeAudio };
