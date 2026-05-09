/**
 * 🗑️ MEDIA CLEANUP SERVICE
 * 
 * Serviço de limpeza automática de mídias do Supabase Storage.
 * 
 * ESTRATÉGIA DE ECONOMIA DE EGRESS:
 * - Mídias são armazenadas temporariamente (1 hora por padrão)
 * - Após processamento pela IA (transcrição, visão), são deletadas
 * - Cliente pode re-baixar sob demanda apertando botão
 * - Metadados (tipo, tamanho, nome) são preservados no banco
 * 
 * ECONOMIA ESTIMADA: ~95% do egress de mídias
 * 
 * FLUXO:
 * 1. Mídia chega do WhatsApp → Upload temporário no Storage
 * 2. IA processa (transcreve áudio, analisa imagem)
 * 3. Após 1h → Serviço deleta do Storage
 * 4. Cliente quer ver → Botão re-baixa do WhatsApp (se conectado)
 */

import { supabase } from "./supabaseAuth";
import { db } from "./db";
import { pool } from "./db";
import { messages } from "@shared/schema";
import { isNotNull, and, lt, like, or, eq, inArray, asc } from "drizzle-orm";
import { transcribeAudioWithMistral } from "./mistralClient";

// Configuração
const BUCKET_NAME = "whatsapp-media";
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Rodar a cada 15 minutos
const MEDIA_TTL_MINUTES = 30; // Tempo de vida das mídias (30 minutos)
const BATCH_SIZE = 500; // Quantos arquivos deletar por lote
const MAX_BATCHES_PER_RUN = 20; // Limita o trabalho por execução para não travar o runtime

interface CleanupStats {
  totalFiles: number;
  deletedFiles: number;
  freedBytes: number;
  errors: number;
  duration: number;
}

// Estado do serviço
let cleanupInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Inicia o serviço de limpeza automática
 */
export function startMediaCleanupService(): void {
  if (cleanupInterval) {
    console.log(`⚠️ [MEDIA CLEANUP] Serviço já está rodando`);
    return;
  }

  console.log(`\n🗑️ ═══════════════════════════════════════════════════════════════`);
  console.log(`🗑️ [MEDIA CLEANUP] Iniciando serviço de limpeza automática`);
  console.log(`🗑️ [MEDIA CLEANUP] Intervalo: ${CLEANUP_INTERVAL_MS / 60000} minutos`);
  console.log(`🗑️ [MEDIA CLEANUP] TTL das mídias: ${MEDIA_TTL_MINUTES} minutos`);
  console.log(`🗑️ ═══════════════════════════════════════════════════════════════\n`);

  // 🔥 CRÍTICO: Executar primeira limpeza IMEDIATAMENTE (após 30 segundos)
  setTimeout(() => {
    console.log(`🚀 [MEDIA CLEANUP] Executando primeira limpeza...`);
    void runCleanup();
  }, 30 * 1000); // 30 segundos ao invés de 5 minutos

  // Agendar limpezas periódicas
  cleanupInterval = setInterval(() => {
    void runCleanup();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Para o serviço de limpeza
 */
export function stopMediaCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log(`🛑 [MEDIA CLEANUP] Serviço parado`);
  }
}

/**
 * Executa uma rodada de limpeza de mídias antigas
 */
export async function runCleanup(): Promise<CleanupStats> {
  if (isRunning) {
    console.log(`⏳ [MEDIA CLEANUP] Limpeza já em andamento, pulando...`);
    return { totalFiles: 0, deletedFiles: 0, freedBytes: 0, errors: 0, duration: 0 };
  }

  isRunning = true;
  const startTime = Date.now();
  
  console.log(`\n🗑️ [MEDIA CLEANUP] Iniciando limpeza de mídias antigas...`);
  
  const stats: CleanupStats = {
    totalFiles: 0,
    deletedFiles: 0,
    freedBytes: 0,
    errors: 0,
    duration: 0,
  };

  try {
    // 🎤 CRÍTICO: Transcrever áudios pendentes ANTES de deletar arquivos
    await transcribePendingAudios();
    
    // Calcular cutoff (arquivos mais antigos que X minutos)
    const cutoffDate = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
    console.log(`🗑️ [MEDIA CLEANUP] Deletando mídias rebaixáveis criadas antes de: ${cutoffDate.toISOString()}`);

    for (let batchNumber = 0; batchNumber < MAX_BATCHES_PER_RUN; batchNumber++) {
      const batch = await fetchExpiredMessageMediaBatch(cutoffDate, BATCH_SIZE);
      if (batch.length === 0) {
        if (batchNumber === 0) {
          console.log(`✅ [MEDIA CLEANUP] Nenhuma mídia elegível para limpeza`);
        }
        break;
      }

      stats.totalFiles += batch.length;

      const removableEntries = batch
        .map((message) => ({
          id: message.id,
          path: extractStoragePathFromMediaUrl(message.mediaUrl),
        }))
        .filter((entry): entry is { id: string; path: string } => Boolean(entry.path));

      const removablePaths = removableEntries.map((entry) => entry.path);

      if (removablePaths.length === 0) {
        await clearExpiredMessageMedia(batch.map((message) => message.id));
        continue;
      }

      console.log(
        `🗑️ [MEDIA CLEANUP] Lote ${batchNumber + 1}/${MAX_BATCHES_PER_RUN}: removendo ${removablePaths.length} objetos expirados...`,
      );

      const batchBytes = await getStorageObjectsSize(removablePaths);
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(removablePaths);

      if (deleteError) {
        console.error(`❌ [MEDIA CLEANUP] Erro ao deletar lote expirado:`, deleteError);
        stats.errors++;
        break;
      }

      await clearExpiredMessageMedia(removableEntries.map((entry) => entry.id));
      stats.deletedFiles += removablePaths.length;
      stats.freedBytes += batchBytes;

      if (batch.length < BATCH_SIZE) {
        break;
      }
    }

    const strippedBase64Rows = await stripLegacyBase64MediaFromDatabase(cutoffDate, BATCH_SIZE);
    if (strippedBase64Rows > 0) {
      console.log(`🧹 [MEDIA CLEANUP] ${strippedBase64Rows} mensagens antigas com base64 foram limpas do banco`);
    }

  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro inesperado:`, error);
    stats.errors++;
  } finally {
    isRunning = false;
    stats.duration = Date.now() - startTime;
    
    console.log(`\n✅ [MEDIA CLEANUP] Limpeza concluída!`);
    console.log(`📊 [MEDIA CLEANUP] Estatísticas:`);
    console.log(`   - Arquivos verificados: ${stats.totalFiles}`);
    console.log(`   - Arquivos deletados: ${stats.deletedFiles}`);
    console.log(`   - Espaço liberado: ${formatBytes(stats.freedBytes)}`);
    console.log(`   - Erros: ${stats.errors}`);
    console.log(`   - Duração: ${stats.duration}ms\n`);
  }

  return stats;
}

async function fetchExpiredMessageMediaBatch(cutoffDate: Date, limit: number) {
  return await db
    .select({
      id: messages.id,
      mediaUrl: messages.mediaUrl,
    })
    .from(messages)
    .where(
      and(
        isNotNull(messages.mediaUrl),
        or(
          like(messages.mediaUrl, "%supabase.co/storage%"),
          like(messages.mediaUrl, "%/storage/v1/object/%"),
        ),
        isNotNull(messages.mediaKey),
        isNotNull(messages.directPath),
        lt(messages.createdAt, cutoffDate),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(limit);
}

async function clearExpiredMessageMedia(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  await db
    .update(messages)
    .set({ mediaUrl: null })
    .where(inArray(messages.id, messageIds));
}

async function stripLegacyBase64MediaFromDatabase(cutoffDate: Date, limit: number): Promise<number> {
  const legacyRows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        isNotNull(messages.mediaUrl),
        like(messages.mediaUrl, "data:%"),
        isNotNull(messages.mediaKey),
        isNotNull(messages.directPath),
        lt(messages.createdAt, cutoffDate),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(limit);

  const ids = legacyRows.map((row) => row.id);
  if (ids.length === 0) return 0;

  await db
    .update(messages)
    .set({ mediaUrl: null })
    .where(inArray(messages.id, ids));

  return ids.length;
}

function extractStoragePathFromMediaUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;

  try {
    const parsedUrl = new URL(mediaUrl);
    const objectMarker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const markerIndex = parsedUrl.pathname.indexOf(objectMarker);
    if (markerIndex === -1) return null;

    return decodeURIComponent(parsedUrl.pathname.slice(markerIndex + objectMarker.length));
  } catch {
    return null;
  }
}

async function getStorageObjectsSize(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;

  const { rows } = await pool.query<{ bytes: string }>(
    `
      select coalesce(sum((metadata->>'size')::bigint), 0) as bytes
      from storage.objects
      where bucket_id = $1
        and name = any($2::text[])
    `,
    [BUCKET_NAME, paths],
  );

  return Number(rows[0]?.bytes || 0);
}

/**
 * Força limpeza imediata de todas as mídias antigas
 * Útil para chamada manual via API admin
 */
export async function forceCleanup(): Promise<CleanupStats> {
  console.log(`🚀 [MEDIA CLEANUP] Limpeza forçada solicitada!`);
  return runCleanup();
}

/**
 * Retorna estatísticas atuais do storage
 */
export async function getStorageStats(): Promise<{
  totalFiles: number;
  totalSize: string;
  oldFiles: number;
  oldSize: string;
}> {
  try {
    const { rows } = await pool.query<{
      total_files: string;
      total_bytes: string;
      old_files: string;
      old_bytes: string;
    }>(
      `
        select
          count(*) as total_files,
          coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes,
          count(*) filter (where created_at < now() - ($2 || ' minutes')::interval) as old_files,
          coalesce(sum((metadata->>'size')::bigint) filter (where created_at < now() - ($2 || ' minutes')::interval), 0) as old_bytes
        from storage.objects
        where bucket_id = $1
      `,
      [BUCKET_NAME, String(MEDIA_TTL_MINUTES)],
    );

    const summary = rows[0];
    if (!summary) {
      return { totalFiles: 0, totalSize: "0 B", oldFiles: 0, oldSize: "0 B" };
    }

    return {
      totalFiles: Number(summary.total_files || 0),
      totalSize: formatBytes(Number(summary.total_bytes || 0)),
      oldFiles: Number(summary.old_files || 0),
      oldSize: formatBytes(Number(summary.old_bytes || 0)),
    };
  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro ao obter estatísticas:`, error);
    return { totalFiles: 0, totalSize: "0 B", oldFiles: 0, oldSize: "0 B" };
  }
}

/**
 * Formata bytes para exibição legível
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
/**
 * 🎤 TRANSCRIÇÃO PREVENTIVA: Transcreve áudios que ainda não foram transcritos
 * ANTES de expirar a mídia.
 * 
 * Isso garante que:
 * 1. Áudios do CLIENTE são transcritos antes de deletar
 * 2. Áudios do DONO (fromMe=true) também são transcritos
 * 3. A transcrição fica salva mesmo depois da mídia expirar
 */
async function transcribePendingAudios(): Promise<void> {
  try {
    const cutoffDate = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
    
    // Buscar áudios que:
    // 1. Tem mediaUrl (ainda não expirou)
    // 2. Não tem transcrição (text é emoji ou vazio)
    // 3. São mais antigos que cutoff (vão ser deletados em breve)
    const pendingAudios = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.mediaType, "audio"),
          isNotNull(messages.mediaUrl),
          // Mensagens que vão expirar em breve
          lt(messages.createdAt, new Date(Date.now() - (MEDIA_TTL_MINUTES - 5) * 60 * 1000))
        )
      )
      .limit(20); // Processar no máximo 20 por vez para não sobrecarregar

    if (pendingAudios.length === 0) {
      return;
    }

    console.log(`🎤 [MEDIA CLEANUP] ${pendingAudios.length} áudios pendentes de transcrição antes de expirar`);

    for (const audio of pendingAudios) {
      // Verificar se já tem transcrição real (não emoji)
      const hasRealTranscription = audio.text && 
        !audio.text.startsWith('🎵') && 
        !audio.text.startsWith('🎤') &&
        !audio.text.startsWith('[Áudio') &&
        audio.text.length > 20; // Transcrições reais tem mais de 20 chars

      if (hasRealTranscription) {
        continue; // Já transcrito
      }

      if (!audio.mediaUrl) {
        continue; // Sem URL
      }

      try {
        console.log(`🎤 [MEDIA CLEANUP] Transcrevendo áudio ${audio.id} antes de expirar...`);
        
        let audioBuffer: Buffer | null = null;

        // Baixar áudio da URL
        if (audio.mediaUrl.startsWith("data:")) {
          const base64Part = audio.mediaUrl.split(",")[1];
          if (base64Part) {
            audioBuffer = Buffer.from(base64Part, "base64");
          }
        } else if (audio.mediaUrl.startsWith("http")) {
          const response = await fetch(audio.mediaUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = Buffer.from(arrayBuffer);
          }
        }

        if (!audioBuffer || audioBuffer.length === 0) {
          console.log(`⚠️ [MEDIA CLEANUP] Não foi possível baixar áudio ${audio.id}`);
          continue;
        }

        // Transcrever com Mistral
        const transcription = await transcribeAudioWithMistral(audioBuffer, {
          fileName: "whatsapp-audio.ogg",
        });

        if (transcription && transcription.length > 0) {
          // Atualizar texto da mensagem com transcrição
          await db
            .update(messages)
            .set({ text: transcription })
            .where(eq(messages.id, audio.id));
          
          console.log(`✅ [MEDIA CLEANUP] Áudio ${audio.id} transcrito: "${transcription.substring(0, 50)}..."`);
        }

        // Delay entre transcrições para não sobrecarregar API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ [MEDIA CLEANUP] Erro ao transcrever áudio ${audio.id}:`, error);
      }
    }
  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro ao buscar áudios pendentes:`, error);
  }
}

/**
 * Força execução imediata de limpeza (usado por endpoint admin)
 */
export async function forceMediaCleanup(): Promise<CleanupStats> {
  console.log(`🚀 [MEDIA CLEANUP] Limpeza FORÇADA iniciada pelo admin`);
  return await runCleanup();
}
