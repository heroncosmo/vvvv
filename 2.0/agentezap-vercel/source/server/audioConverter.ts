import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

function inferInputExtension(normalizedMime: string): string {
  if (normalizedMime.includes('webm')) return 'webm';
  if (normalizedMime.includes('mpeg') || normalizedMime.includes('mp3')) return 'mp3';
  if (normalizedMime.includes('mp4') || normalizedMime.includes('m4a')) return 'mp4';
  if (normalizedMime.includes('wav')) return 'wav';
  if (normalizedMime.includes('ogg') || normalizedMime.includes('opus')) return 'ogg';
  return 'bin';
}

function isOggContainerMime(normalizedMime: string): boolean {
  return (
    normalizedMime.includes('audio/ogg') ||
    normalizedMime.includes('application/ogg') ||
    normalizedMime.startsWith('audio/ogg')
  );
}

function hasOggHeader(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString() === 'OggS';
}

function isRemoteAudioSource(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

async function fetchRemoteAudioBuffer(url: string, fallbackMimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Falha ao baixar audio remoto (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') || fallbackMimeType || 'application/octet-stream';
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface ConvertedWhatsAppAudioBuffer {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  converted: boolean;
}

/**
 * Converte um buffer de áudio qualquer para OGG/Opus compatível com nota de voz no WhatsApp.
 * Se a entrada já estiver em OGG válido, retorna o buffer original.
 */
export async function convertBufferToWhatsAppAudio(
  inputBuffer: Buffer,
  inputMimeType: string
): Promise<ConvertedWhatsAppAudioBuffer> {
  const normalizedMime = (inputMimeType || '').toLowerCase();
  const inputExt = inferInputExtension(normalizedMime);

  if (isOggContainerMime(normalizedMime) && hasOggHeader(inputBuffer)) {
    console.log('[AudioConverter] ✅ Buffer já está em OGG/Opus, sem conversão necessária');
    return {
      buffer: inputBuffer,
      mimeType: 'audio/ogg; codecs=opus',
      extension: 'ogg',
      converted: false,
    };
  }

  const tempId = randomUUID();
  const inputPath = join(tmpdir(), `audio_input_${tempId}.${inputExt}`);
  const outputPath = join(tmpdir(), `audio_output_${tempId}.ogg`);

  try {
    console.log('[AudioConverter] 🔄 Iniciando conversão de buffer', inputMimeType, 'para OGG/Opus');
    await writeFile(inputPath, inputBuffer);
    console.log('[AudioConverter] 📝 Buffer de entrada salvo:', inputBuffer.length, 'bytes');

    const ffmpegCmd = `ffmpeg -y -fflags +genpts -i "${inputPath}" -avoid_negative_ts make_zero -c:a libopus -b:a 64k -vbr on -vn -ar 48000 -ac 1 -application voip -f ogg "${outputPath}"`;
    let ffmpegExecutionError: any = null;

    console.log('[AudioConverter] 🎬 Executando FFmpeg...');

    try {
      await execAsync(ffmpegCmd, { timeout: 30000 });
    } catch (ffmpegError: any) {
      ffmpegExecutionError = ffmpegError;
      console.log('[AudioConverter] ⚠️ FFmpeg stderr (pode ser normal):', ffmpegError.stderr?.slice(0, 200));
    }

    try {
      await access(outputPath);
    } catch {
      if (ffmpegExecutionError) {
        throw ffmpegExecutionError;
      }
      throw new Error('Arquivo convertido não foi gerado pelo FFmpeg');
    }

    const outputBuffer = await readFile(outputPath);
    console.log('[AudioConverter] ✅ Conversão concluída:', outputBuffer.length, 'bytes');

    return {
      buffer: outputBuffer,
      mimeType: 'audio/ogg; codecs=opus',
      extension: 'ogg',
      converted: true,
    };
  } catch (error: any) {
    console.error('[AudioConverter] ❌ Erro na conversão do buffer:', error.message);
    console.log('[AudioConverter] ⚠️ Fallback: mantendo buffer original');

    return {
      buffer: inputBuffer,
      mimeType: inputMimeType || 'application/octet-stream',
      extension: inputExt,
      converted: false,
    };
  } finally {
    try {
      await Promise.all([
        unlink(inputPath).catch(() => {}),
        unlink(outputPath).catch(() => {}),
      ]);
    } catch {
      // Ignorar cleanup
    }
  }
}

/**
 * Converte áudio Base64 de WebM para OGG/Opus para compatibilidade com WhatsApp PTT
 * @param base64Data - Dados do áudio em base64 (pode ter prefixo data:audio/...)
 * @param inputMimeType - Tipo MIME de entrada (ex: audio/webm;codecs=opus)
 * @returns Base64 do áudio convertido em OGG/Opus
 */
export async function convertToWhatsAppAudio(
  base64Data: string,
  inputMimeType: string
): Promise<{ data: string; mimeType: string }> {
  const trimmedData = base64Data.trim();

  if (isRemoteAudioSource(trimmedData)) {
    const remoteAudio = await fetchRemoteAudioBuffer(trimmedData, inputMimeType);
    const converted = await convertBufferToWhatsAppAudio(remoteAudio.buffer, remoteAudio.mimeType);

    return {
      data: converted.buffer.toString('base64'),
      mimeType: converted.mimeType,
    };
  }

  let pureBase64 = base64Data;
  if (base64Data.startsWith('data:')) {
    pureBase64 = base64Data.split(',')[1];
  }

  const inputBuffer = Buffer.from(pureBase64, 'base64');
  const converted = await convertBufferToWhatsAppAudio(inputBuffer, inputMimeType);

  return {
    data: converted.buffer.toString('base64'),
    mimeType: converted.mimeType,
  };
}

/**
 * Verifica se FFmpeg está disponível no sistema
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    console.log('[AudioConverter] ✅ FFmpeg disponível');
    return true;
  } catch {
    console.log('[AudioConverter] ⚠️ FFmpeg não disponível');
    return false;
  }
}
