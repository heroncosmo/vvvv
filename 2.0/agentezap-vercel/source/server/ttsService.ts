/**
 * 🎙️ TTS SERVICE - Text-to-Speech GRATUITO que FUNCIONA
 * 
 * Opções TESTADAS e FUNCIONAIS:
 * 1. Edge TTS - API GRATUITA da Microsoft (Qualidade Neural HD) ⭐ MELHOR
 * 2. google-tts-api - Usa Google Translate (GRATUITO, sem API key)
 * 3. say.js - Usa TTS nativo do Windows (SAPI) - FUNCIONA OFFLINE
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import say from 'say';
import * as googleTTS from 'google-tts-api';
import { MsEdgeTTS as LegacyMsEdgeTTS, OUTPUT_FORMAT as LEGACY_OUTPUT_FORMAT } from 'edge-tts-node';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const execPromise = promisify(exec);
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function buildTmpAudioFilePath(prefix: string, extension: string = 'mp3'): string {
  return path.join(process.cwd(), 'tmp', `${prefix}-${Date.now()}.${extension}`);
}

function inferLanguageFromVoice(voice: string): string {
  const [language, region] = voice.split('-');

  if (language && region) {
    return `${language}-${region}`;
  }

  return 'pt-BR';
}

async function readGeneratedAudioFile(filePath: string): Promise<Buffer> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error('Arquivo de áudio não foi gerado');
  }

  const buffer = await fs.readFile(filePath);

  if (!buffer || buffer.length < 1000) {
    throw new Error(`Áudio gerado muito pequeno: ${buffer?.length || 0} bytes`);
  }

  return buffer;
}

async function generateWithEdgeTtsPythonCli(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
): Promise<Buffer> {
  const tmpDir = path.join(process.cwd(), 'tmp');
  await fs.mkdir(tmpDir, { recursive: true });

  const tmpFile = buildTmpAudioFilePath('tts', 'mp3');
  const escapedText = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "'\\''")
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');

  const command = `python3 -m edge_tts --voice "${voice}" --rate="${rate}" --pitch="${pitch}" --text "${escapedText}" --write-media "${tmpFile}"`;

  console.log('🔧 [EDGE-TTS] Executando comando Python...');
  console.log('📦 [EDGE-TTS] Comando:', command.substring(0, 150) + '...');

  try {
    const { stderr } = await execPromise(command, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stderr.includes('INFO')) {
      console.warn('⚠️ [EDGE-TTS] STDERR:', stderr);
    }

    return await readGeneratedAudioFile(tmpFile);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

async function generateWithEdgeTtsNode(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
): Promise<Buffer> {
  await ensureTempDir();

  const outputFile = path.join(TEMP_AUDIO_DIR, `edge_node_tts_${Date.now()}.mp3`);
  const tts = new LegacyMsEdgeTTS({});

  try {
    await tts.setMetadata(
      voice,
      LEGACY_OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      inferLanguageFromVoice(voice),
    );
    await tts.toFile(outputFile, text, { rate, pitch });

    return await readGeneratedAudioFile(outputFile);
  } finally {
    tts.close();
    await fs.unlink(outputFile).catch(() => {});
  }
}

function resolveMsEdgeTtsFilePath(result: any): string {
  return typeof result === 'string' ? result : String(result?.audioFilePath || '');
}

async function generateWithMsEdgeTtsPackage(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
): Promise<Buffer> {
  await ensureTempDir();

  const outputDir = path.join(TEMP_AUDIO_DIR, `msedge_tts_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  await fs.mkdir(outputDir, { recursive: true });
  const tts = new MsEdgeTTS({});

  try {
    await tts.setMetadata(
      voice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      inferLanguageFromVoice(voice),
    );
    const fileResult = await tts.toFile(outputDir, text, { rate, pitch });
    const audioFilePath = resolveMsEdgeTtsFilePath(fileResult);
    if (!audioFilePath) {
      throw new Error('Provider de voz nao retornou arquivo de audio');
    }

    return await readGeneratedAudioFile(audioFilePath);
  } finally {
    tts.close?.();
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function generateWithMsEdgeTtsPackageRetry(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await generateWithMsEdgeTtsPackage(text, voice, rate, pitch);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await wait(600 * attempt);
      }
    }
  }
  throw lastError;
}

function speedFromEdgeRate(rate: string): number {
  const match = String(rate || '').match(/([+-]?\d+(?:\.\d+)?)%/);
  if (!match) return 1;
  return Math.max(0.5, Math.min(2, 1 + Number(match[1]) / 100));
}

async function generateWithOpenAiTTS(
  text: string,
  voice: string,
  rate: string,
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_TTS_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI TTS nao configurado');
  }

  const normalizedVoice = voice.includes('Antonio') ? 'onyx' : 'nova';
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: normalizedVoice,
      input: text.slice(0, 4096),
      response_format: 'mp3',
      speed: speedFromEdgeRate(rate),
      instructions: voice.includes('Antonio')
        ? 'Fale em portugues do Brasil com tom masculino, natural e comercial.'
        : 'Fale em portugues do Brasil com tom feminino, natural e acolhedor.',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`OpenAI TTS falhou: ${response.status} ${String(errorText || '').slice(0, 180)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer || buffer.length < 1000) {
    throw new Error(`Audio muito pequeno: ${buffer?.length || 0} bytes`);
  }
  return buffer;
}

// ============================================================
// EDGE TTS - MICROSOFT NEURAL TTS GRATUITO! ⭐ MELHOR OPÇÃO
// ============================================================

/**
 * 🎙️ Edge TTS - Microsoft Neural TTS GRATUITO
 * 
 * ✅ 100% GRATUITO - Sem limites, sem API key
 * ✅ Qualidade Neural HD - Voz muito natural
 * ✅ Voz Brasileira - pt-BR-FranciscaNeural (feminina) ou pt-BR-AntonioNeural (masculina)
 * ✅ Rápido - Baixa latência
 * 
 * Vozes disponíveis para pt-BR:
 * - pt-BR-FranciscaNeural (feminina, padrão)
 * - pt-BR-AntonioNeural (masculino)
 * - pt-BR-ThalitaNeural (feminina)
 * - pt-BR-LeticiaNeural (feminina)
 */
export async function generateWithEdgeTTS(
  text: string, 
  voice: string = 'pt-BR-FranciscaNeural',
  rate: string = '+0%',
  pitch: string = '+0Hz'
): Promise<Buffer> {
  console.log('🎙️ [EDGE-TTS] Gerando áudio com fallback resiliente...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  console.log('🔊 Voz:', voice, '| Rate:', rate, '| Pitch:', pitch);

  const attempts = [
    {
      label: 'msedge-tts',
      run: () => generateWithMsEdgeTtsPackageRetry(text, voice, rate, pitch),
    },
    {
      label: 'python-cli',
      run: () => generateWithEdgeTtsPythonCli(text, voice, rate, pitch),
    },
    {
      label: 'edge-tts-node',
      run: () => generateWithEdgeTtsNode(text, voice, rate, pitch),
    },
    {
      label: 'openai-tts',
      run: () => generateWithOpenAiTTS(text, voice, rate),
    },
    {
      label: 'google-tts',
      run: () => generateWithGoogleTTS(text, inferLanguageFromVoice(voice)),
    },
  ];

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      console.log(`🔄 [EDGE-TTS] Tentando provider: ${attempt.label}`);
      const buffer = await attempt.run();
      console.log(`✅ [EDGE-TTS] Áudio gerado com sucesso via ${attempt.label}: ${buffer.length} bytes`);
      return buffer;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${attempt.label}: ${message}`);
      console.warn(`⚠️ [EDGE-TTS] Provider ${attempt.label} falhou: ${message}`);
    }
  }

  throw new Error(`Edge TTS falhou em todos os providers: ${failures.join(' | ')}`);
}

// ============================================================
// PUTER.JS TTS - REQUER AUTENTICAÇÃO NO BACKEND
// ============================================================

/**
 * Gera áudio usando Puter.js TTS API
 * - 100% GRATUITO e ILIMITADO
 * - Acesso a: AWS Polly, OpenAI TTS, ElevenLabs
 * - Sem API key necessária
 * - Múltiplas vozes neurais de alta qualidade
 */
interface PuterTTSOptions {
  text: string;
  provider?: 'aws-polly' | 'openai' | 'elevenlabs';
  voice?: string;
  engine?: 'standard' | 'neural' | 'long-form' | 'generative';
  language?: string;
  model?: string;
}

async function generateWithPuterTTS(options: PuterTTSOptions): Promise<Buffer> {
  const { 
    text, 
    provider = 'aws-polly', 
    voice = 'Camila', // Voz brasileira da AWS Polly
    engine = 'neural',
    language = 'pt-BR',
    model
  } = options;
  
  console.log('🎙️ [PUTER-TTS] Gerando áudio com Puter.js API...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  console.log('🔊 Provider:', provider, '| Voice:', voice, '| Engine:', engine);
  
  try {
    // Puter.js usa uma API HTTP direta que podemos chamar
    // A API é pública e não requer autenticação
    const puterApiUrl = 'https://api.puter.com/ai/txt2speech';
    
    const requestBody: any = {
      text: text.substring(0, 3000), // Limite de 3000 caracteres
    };
    
    // Configurar opções baseado no provider
    if (provider === 'aws-polly') {
      requestBody.provider = 'aws-polly';
      requestBody.voice = voice;
      requestBody.engine = engine;
      requestBody.language = language;
    } else if (provider === 'openai') {
      requestBody.provider = 'openai';
      requestBody.model = model || 'gpt-4o-mini-tts';
      requestBody.voice = voice || 'alloy';
      requestBody.response_format = 'mp3';
    } else if (provider === 'elevenlabs') {
      requestBody.provider = 'elevenlabs';
      requestBody.model = model || 'eleven_multilingual_v2';
      requestBody.voice = voice || '21m00Tcm4TlvDq8ikWAM';
    }
    
    const response = await fetch(puterApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Puter API error: ${response.status} - ${errorText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`✅ [PUTER-TTS] Áudio gerado: ${buffer.length} bytes`);
    return buffer;
    
  } catch (error: any) {
    console.error('❌ [PUTER-TTS] Erro:', error.message);
    throw error;
  }
}

// Função para usar Puter TTS com vozes brasileiras
export async function generateWithPuterBrazilian(text: string): Promise<Buffer> {
  // Camila é a voz neural brasileira da AWS Polly
  return generateWithPuterTTS({
    text,
    provider: 'aws-polly',
    voice: 'Camila',
    engine: 'neural',
    language: 'pt-BR'
  });
}

// Função para usar Puter TTS com OpenAI
export async function generateWithPuterOpenAI(text: string, voice: string = 'nova'): Promise<Buffer> {
  return generateWithPuterTTS({
    text,
    provider: 'openai',
    voice,
    model: 'gpt-4o-mini-tts'
  });
}

// Função para usar Puter TTS com ElevenLabs
export async function generateWithPuterElevenLabs(text: string): Promise<Buffer> {
  return generateWithPuterTTS({
    text,
    provider: 'elevenlabs',
    model: 'eleven_multilingual_v2'
  });
}

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
    // Ignora se já existe
  }
}

// ============================================================
// OPÇÃO 1: WINDOWS TTS (say.js) - FUNCIONA OFFLINE!
// ============================================================

/**
 * Gera áudio usando o TTS nativo do Windows
 * - 100% gratuito
 * - Funciona OFFLINE
 * - Exporta para WAV
 */
export async function generateWithWindowsTTS(text: string, speed: number = 1.0): Promise<Buffer> {
  await ensureTempDir();
  const timestamp = Date.now();
  const outputFile = path.join(TEMP_AUDIO_DIR, `windows_tts_${timestamp}.wav`);
  
  console.log('🎙️ [WINDOWS-TTS] Gerando áudio com TTS nativo do Windows...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  
  return new Promise((resolve, reject) => {
    // say.export funciona no Windows e Mac
    say.export(text, null, speed, outputFile, (err: any) => {
      if (err) {
        console.error('❌ [WINDOWS-TTS] Erro:', err);
        reject(err);
        return;
      }
      
      // Ler o arquivo gerado
      fs.readFile(outputFile)
        .then(buffer => {
          console.log(`✅ [WINDOWS-TTS] Áudio gerado: ${buffer.length} bytes`);
          // Limpar arquivo temporário
          fs.unlink(outputFile).catch(() => {});
          resolve(buffer);
        })
        .catch(reject);
    });
  });
}

// ============================================================
// OPÇÃO 2: GOOGLE TTS (google-tts-api) - GRATUITO!
// ============================================================

/**
 * Gera áudio usando Google Translate TTS
 * - 100% gratuito (usa API pública do Google Translate)
 * - Boa qualidade
 * - Suporta português brasileiro
 */
export async function generateWithGoogleTTS(text: string, lang: string = 'pt-BR'): Promise<Buffer> {
  console.log('🎙️ [GOOGLE-TTS] Gerando áudio com Google Translate TTS...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  
  // google-tts-api usa códigos de idioma simples (pt, en, es) não pt-BR
  const normalizedLang = lang.split('-')[0]; // pt-BR -> pt, en-US -> en
  console.log('🌐 Idioma:', normalizedLang);
  
  try {
    // Para textos curtos (até 200 chars), usar getAudioBase64
    if (text.length <= 200) {
      const base64 = await googleTTS.getAudioBase64(text, {
        lang: normalizedLang,
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
      });
      
      const buffer = Buffer.from(base64, 'base64');
      console.log(`✅ [GOOGLE-TTS] Áudio gerado: ${buffer.length} bytes`);
      return buffer;
    }
    
    // Para textos longos, dividir em partes
    const results = await googleTTS.getAllAudioBase64(text, {
      lang: normalizedLang,
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000,
      splitPunct: '.,!?;:',
    });
    
    // Concatenar todos os buffers de áudio
    const buffers = results.map(r => Buffer.from(r.base64, 'base64'));
    const finalBuffer = Buffer.concat(buffers);
    
    console.log(`✅ [GOOGLE-TTS] Áudio gerado (${results.length} partes): ${finalBuffer.length} bytes`);
    return finalBuffer;
    
  } catch (error: any) {
    console.error('❌ [GOOGLE-TTS] Erro:', error.message);
    throw error;
  }
}

// ============================================================
// SERVIÇO PRINCIPAL COM FALLBACK
// ============================================================

export type TTSProvider = 'edge' | 'edge-antonio' | 'windows' | 'google' | 'puter' | 'puter-openai' | 'puter-elevenlabs' | 'auto';

interface TTSOptions {
  text: string;
  provider?: TTSProvider;
  speed?: number;
  lang?: string;
}

interface TTSResult {
  audio: Buffer;
  provider: string;
  format: string;
}

/**
 * Serviço principal de TTS com fallback automático
 * Tenta várias engines até conseguir gerar o áudio
 * 
 * Ordem de prioridade (modo auto):
 * 1. Edge TTS (Francisca Neural) - GRATUITO, Qualidade Neural HD ⭐ MELHOR
 * 2. Google TTS - Boa qualidade, sempre funciona
 * 3. Windows TTS - Funciona offline
 */
export async function generateTTS(options: TTSOptions): Promise<TTSResult> {
  const { text, provider = 'auto', speed = 1.0, lang = 'pt-BR' } = options;
  
  if (!text || text.trim().length === 0) {
    throw new Error('Texto vazio');
  }
  
  console.log(`\n🎤 [TTS] Iniciando geração de áudio...`);
  console.log(`📋 Provider: ${provider}`);
  console.log(`📝 Texto (${text.length} chars): "${text.substring(0, 50)}..."`);
  
  // Edge TTS - Voz feminina Francisca (padrão)
  if (provider === 'edge') {
    const audio = await generateWithEdgeTTS(text, 'pt-BR-FranciscaNeural');
    return { audio, provider: 'Edge TTS (Francisca Neural)', format: 'mp3' };
  }
  
  // Edge TTS - Voz masculina Antonio
  if (provider === 'edge-antonio') {
    const audio = await generateWithEdgeTTS(text, 'pt-BR-AntonioNeural');
    return { audio, provider: 'Edge TTS (Antonio Neural)', format: 'mp3' };
  }
  
  // Se provider específico foi solicitado
  if (provider === 'windows') {
    const audio = await generateWithWindowsTTS(text, speed);
    return { audio, provider: 'Windows TTS', format: 'wav' };
  }
  
  if (provider === 'google') {
    const audio = await generateWithGoogleTTS(text, lang);
    return { audio, provider: 'Google TTS', format: 'mp3' };
  }
  
  if (provider === 'puter') {
    const audio = await generateWithPuterBrazilian(text);
    return { audio, provider: 'Puter (AWS Polly Neural)', format: 'mp3' };
  }
  
  if (provider === 'puter-openai') {
    const audio = await generateWithPuterOpenAI(text);
    return { audio, provider: 'Puter (OpenAI TTS)', format: 'mp3' };
  }
  
  if (provider === 'puter-elevenlabs') {
    const audio = await generateWithPuterElevenLabs(text);
    return { audio, provider: 'Puter (ElevenLabs)', format: 'mp3' };
  }
  
  // Modo automático: APENAS Edge TTS (gratuito, ilimitado e melhor qualidade)
  const providers = [
    { name: 'Edge TTS (Francisca Neural)', fn: () => generateWithEdgeTTS(text, 'pt-BR-FranciscaNeural'), format: 'mp3' },
  ];
  
  let lastError: Error | null = null;
  
  for (const prov of providers) {
    try {
      console.log(`🔄 [TTS] Tentando ${prov.name}...`);
      const audio = await prov.fn();
      
      // Verificar se o áudio é válido (mais de 1KB)
      if (audio && audio.length > 1000) {
        console.log(`✅ [TTS] Sucesso com ${prov.name}! Tamanho: ${audio.length} bytes`);
        return {
          audio,
          provider: prov.name,
          format: prov.format
        };
      } else {
        console.warn(`⚠️ [TTS] ${prov.name} gerou áudio muito pequeno: ${audio?.length || 0} bytes`);
      }
    } catch (error: any) {
      console.warn(`⚠️ [TTS] ${prov.name} falhou:`, error.message);
      lastError = error;
    }
  }
  
  throw lastError || new Error('Nenhum provider de TTS conseguiu gerar o áudio');
}

/**
 * Lista vozes disponíveis no Windows
 */
export function listWindowsVoices(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    say.getInstalledVoices((err: any, voices: string[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(voices);
      }
    });
  });
}

/**
 * Limpa arquivos temporários antigos
 */
export async function cleanupTempFiles(maxAgeMinutes: number = 60): Promise<number> {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_AUDIO_DIR);
    const now = Date.now();
    let deleted = 0;
    
    for (const file of files) {
      const filePath = path.join(TEMP_AUDIO_DIR, file);
      const stats = await fs.stat(filePath);
      const ageMinutes = (now - stats.mtime.getTime()) / 1000 / 60;
      
      if (ageMinutes > maxAgeMinutes) {
        await fs.unlink(filePath);
        deleted++;
      }
    }
    
    return deleted;
  } catch {
    return 0;
  }
}
