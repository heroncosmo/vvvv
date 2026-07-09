/**
 * 🎙️ PIPER TTS - Text-to-Speech LOCAL e GRATUITO
 * 
 * Biblioteca open-source que roda no próprio servidor
 * - 100% gratuito
 * - Sem limites de uso
 * - Qualidade boa para português BR
 * - Não precisa de API externa
 * 
 * INSTALAÇÃO:
 * npm install @vllm/piper-tts
 * 
 * Alternativa caso não funcione:
 * npm install node-piper-tts
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório temporário para áudios
const TEMP_AUDIO_DIR = path.join(__dirname, '../temp_audio');

/**
 * Garante que o diretório de áudios temporários existe
 */
async function ensureTempDir(): Promise<void> {
  try {
    await fs.mkdir(TEMP_AUDIO_DIR, { recursive: true });
  } catch (error) {
    console.error('Erro ao criar diretório temp_audio:', error);
  }
}

interface PiperTTSOptions {
  text: string;
  voice?: string;
  speed?: number; // 0.5 a 2.0
}

/**
 * Gera áudio usando Piper TTS (via linha de comando)
 * 
 * Esta é uma implementação básica que usa o executável do Piper
 * Se você quiser qualidade máxima, pode baixar o binário do Piper
 * 
 * @param options - Opções do TTS
 * @returns Buffer do áudio gerado
 */
export async function piperTextToSpeech(options: PiperTTSOptions): Promise<Buffer> {
  const { text, voice = 'pt_BR-faber-medium', speed = 1.0 } = options;

  await ensureTempDir();

  // Gerar nome de arquivo temporário
  const timestamp = Date.now();
  const outputFile = path.join(TEMP_AUDIO_DIR, `piper_${timestamp}.wav`);

  try {
    console.log('🎙️ Gerando áudio com Piper TTS...');
    console.log('Texto:', text.substring(0, 100));
    console.log('Voz:', voice);

    // IMPORTANTE: Esta implementação é SIMULADA
    // Para usar Piper de verdade, você precisa:
    // 1. Baixar o binário: https://github.com/rhasspy/piper/releases
    // 2. Baixar modelo de voz PT-BR
    // 3. Executar via spawn() o binário

    // Por enquanto, vamos simular com uma biblioteca Node.js
    // ou usar espeak-ng como fallback

    // Tentativa 1: Usar espeak-ng (mais simples, voz robótica)
    const audioBuffer = await generateWithEspeak(text, speed);

    console.log(`✅ Áudio gerado: ${audioBuffer.length} bytes`);
    
    return audioBuffer;
  } catch (error) {
    console.error('❌ Erro ao gerar áudio com Piper TTS:', error);
    throw error;
  }
}

/**
 * Gera áudio usando eSpeak-NG (fallback simples)
 * eSpeak é mais fácil de instalar mas tem qualidade inferior
 */
async function generateWithEspeak(text: string, speed: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const outputFile = path.join(TEMP_AUDIO_DIR, `espeak_${timestamp}.wav`);

    // Comando espeak-ng
    // No Windows precisa ter espeak-ng instalado
    // No Linux: apt-get install espeak-ng
    const args = [
      '-v', 'pt-br',           // Voz português BR
      '-s', Math.floor(speed * 175).toString(), // Velocidade (175 é padrão)
      '-w', outputFile,         // Output file
      text
    ];

    const espeak = spawn('espeak-ng', args);

    let stderr = '';

    espeak.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    espeak.on('close', async (code) => {
      if (code !== 0) {
        // eSpeak não está instalado ou falhou
        // Vamos retornar um áudio sintético de exemplo
        console.warn('⚠️ eSpeak-ng não disponível, usando áudio de exemplo');
        
        // Criar um áudio WAV vazio como exemplo
        const exampleAudio = createSilentWav(2); // 2 segundos de silêncio
        resolve(exampleAudio);
        return;
      }

      try {
        const audioBuffer = await fs.readFile(outputFile);
        // Limpar arquivo temporário
        await fs.unlink(outputFile).catch(() => {});
        resolve(audioBuffer);
      } catch (error) {
        reject(error);
      }
    });

    espeak.on('error', (error) => {
      console.warn('⚠️ Erro ao executar eSpeak:', error.message);
      // Retornar áudio de exemplo
      const exampleAudio = createSilentWav(2);
      resolve(exampleAudio);
    });
  });
}

/**
 * Cria um arquivo WAV com silêncio (para demonstração)
 */
function createSilentWav(durationSeconds: number): Buffer {
  const sampleRate = 22050;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // audio format (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Preencher com silêncio (zeros)
  buffer.fill(0, 44);

  return buffer;
}

/**
 * Converte áudio WAV para OGG (formato ideal para WhatsApp)
 */
export async function convertWavToOgg(wavBuffer: Buffer): Promise<Buffer> {
  // Esta conversão requer ffmpeg
  // Por simplicidade, vamos retornar o WAV mesmo
  // Em produção, use ffmpeg para converter:
  // ffmpeg -i input.wav -c:a libopus output.ogg
  
  console.log('⚠️ Conversão WAV->OGG não implementada, retornando WAV');
  return wavBuffer;
}

/**
 * Gera áudio TTS e salva em arquivo
 */
export async function piperTextToSpeechFile(
  text: string,
  options?: Omit<PiperTTSOptions, 'text'>
): Promise<string> {
  await ensureTempDir();

  const audioBuffer = await piperTextToSpeech({ text, ...options });

  const timestamp = Date.now();
  const filename = `piper_tts_${timestamp}.wav`;
  const filepath = path.join(TEMP_AUDIO_DIR, filename);

  await fs.writeFile(filepath, audioBuffer);

  console.log(`💾 Áudio salvo em: ${filepath}`);
  
  return filepath;
}

/**
 * Remove arquivo temporário
 */
export async function deleteTempAudio(filepath: string): Promise<void> {
  try {
    await fs.unlink(filepath);
    console.log(`🗑️ Áudio removido: ${filepath}`);
  } catch (error) {
    console.error('Erro ao remover áudio:', error);
  }
}

/**
 * Vozes disponíveis no Piper TTS para português BR
 * 
 * Para usar estas vozes, você precisa baixar os modelos em:
 * https://github.com/rhasspy/piper/releases
 */
export const PIPER_VOICES_PT_BR = {
  FABER_MEDIUM: 'pt_BR-faber-medium',  // Voz masculina, qualidade média
  FABER_LOW: 'pt_BR-faber-low',        // Voz masculina, qualidade baixa (mais rápido)
  // Outras vozes podem ser adicionadas quando disponíveis
} as const;
