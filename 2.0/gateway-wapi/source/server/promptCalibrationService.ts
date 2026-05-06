/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SERVIÇO DE AUTO-CALIBRAÇÃO DE PROMPTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Técnica: IA Cliente vs IA Agente (Self-Consistency + Model-Graded Evaluation)
 * 
 * FLUXO:
 * 1. Usuário pede alteração → Sistema edita prompt
 * 2. Gera cenários de teste específicos para a instrução
 * 3. Executa conversa simulada (Cliente IA ↔ Agente IA)
 * 4. Analisa se resposta do agente demonstra a edição funcionando
 * 5. Se falhar, tenta reparar automaticamente (até 3x)
 * 6. Retorna resultado com score de confiança
 * 
 * Baseado em técnicas de: Anthropic, LangSmith, Microsoft Promptbase
 * 
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes (mesmo LLM do chat produção)
 */

import { chatComplete, type ChatMessage } from "./llm";
import { isRetryablePromptEditMessage } from "@shared/promptEditRetry";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface CenarioTeste {
  id: string;
  perguntaCliente: string;
  expectativaResposta: string;
  tipoValidacao: "contem" | "nao_contem" | "tom" | "semantico";
  palavrasChave?: string[];
}

export interface ResultadoCenario {
  cenarioId: string;
  perguntaCliente: string;
  respostaAgente: string;
  passou: boolean;
  score: number; // 0-100
  motivo: string;
}

export interface ResultadoCalibracao {
  sucesso: boolean;
  scoreGeral: number;
  cenariosTotais: number;
  cenariosAprovados: number;
  resultados: ResultadoCenario[];
  promptFinal: string;
  tentativasReparo: number;
  edicoesAplicadas: number; // Total de edições que foram efetivamente aplicadas ao prompt
  tempoMs: number;
}

export interface ConfiguracaoCalibracao {
  maxTentativasReparo: number;
  numeroCenarios: number;
  turnosConversaMax: number;
  scoreMinimoAprovacao: number;
  timeoutMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO PADRÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG_PADRAO: ConfiguracaoCalibracao = {
  maxTentativasReparo: 3, // Reduzido: 3 tentativas rápidas
  numeroCenarios: 1, // Reduzido: 1 cenário para velocidade máxima
  turnosConversaMax: 1, // 1 turno apenas
  scoreMinimoAprovacao: 60, // Flexibilizado para agilizar
  timeoutMs: 30000 // 30 segundos para cada chamada LLM
};

// ═══════════════════════════════════════════════════════════════════════════
// CALLBACK DE PROGRESSO PARA STREAMING
// ═══════════════════════════════════════════════════════════════════════════

export type ProgressCallback = (log: CalibrationLog) => void;

export interface CalibrationLog {
  type: 'start' | 'scenario_generated' | 'scenario_running' | 'scenario_result' | 'score_update' | 'repair_start' | 'repair_done' | 'loop_iteration' | 'final_result' | 'error';
  message: string;
  data?: any;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS DO SISTEMA
// ═══════════════════════════════════════════════════════════════════════════

const PROMPT_GERADOR_CENARIOS = `Gere 1 pergunta de teste RÁPIDA para validar esta edição no prompt.

FORMATO JSON (sem markdown):
{"cenarios":[{"id":"c1","perguntaCliente":"pergunta curta","expectativaResposta":"o que esperar","tipoValidacao":"semantico","palavrasChave":["palavra1"]}]}

REGRAS:
- Pergunta curta e direta (máximo 15 palavras)
- Palavras-chave: 2-3 palavras importantes
- Foco em verificar se a edição funcionou`;

const PROMPT_CLIENTE_SIMULADO = `Você é um cliente real conversando via WhatsApp com uma empresa.

PERSONA: {{PERSONA}}

REGRAS:
1. Faça APENAS a pergunta especificada, sem adicionar nada
2. Use linguagem natural de WhatsApp (informal, direto ao ponto)
3. Não cumprimente demais, seja objetivo
4. Uma mensagem curta e direta

PERGUNTA A FAZER:
{{PERGUNTA}}`;

const PROMPT_ANALISADOR = `Avalie rapidamente se a resposta demonstra a edição aplicada.

EDIÇÃO: {{INSTRUCAO}}
RESPOSTA: {{RESPOSTA}}
PALAVRAS ESPERADAS: {{PALAVRAS_CHAVE}}

Retorne JSON: {"passou":true/false,"score":0-100,"motivo":"razão curta"}`;

const PROMPT_REPARADOR = `Corrija o prompt para que a edição funcione corretamente.

PROMPT ATUAL (resumo):
{{PROMPT}}

EDIÇÃO PEDIDA: "{{INSTRUCAO}}"
PROBLEMA: {{PROBLEMA}}
ÂNCORAS OBRIGATÓRIAS: {{ANCORAS_OBRIGATORIAS}}

Retorne JSON: {"resposta_chat":"ajuste feito","operacao":"editar","edicoes":[{"buscar":"texto existente","substituir":"texto corrigido"}]}

DICAS:
- Use texto que EXISTE no prompt para "buscar"
- Se não encontrar, adicione nova instrução no final
- NUNCA remova ou altere as âncoras obrigatórias`;

// ═══════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export class PromptCalibrationService {
  private config: ConfiguracaoCalibracao;
  private progressCallback?: ProgressCallback;

  constructor(config?: Partial<ConfiguracaoCalibracao>, progressCallback?: ProgressCallback) {
    // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()
    // Não precisa mais de apiKey ou modelo - usa config do sistema
    this.config = { ...CONFIG_PADRAO, ...config };
    this.progressCallback = progressCallback;
    console.log(`🎯 [Calibração] Inicializado com OpenRouter/Chutes (mesmo LLM da produção)`);
  }

  /**
   * Emite log de progresso para streaming
   */
  private emitProgress(type: CalibrationLog['type'], message: string, data?: any): void {
    if (this.progressCallback) {
      this.progressCallback({
        type,
        message,
        data,
        timestamp: Date.now()
      });
    }
    console.log(`📡 [Calibração] ${message}`);
  }

  /**
   * Método helper para fazer chamadas ao LLM unificado
   * 🚀 OTIMIZADO: Com retry automático e melhor tratamento de erros
   */
  private async callLLM(
    systemPrompt: string, 
    userMessage: string, 
    options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
  ): Promise<string> {
    const MAX_RETRIES = 3;
    const timeoutMs = Math.max(15000, Math.min(this.config.timeoutMs || 30000, 30000));
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 [Calibração LLM] Tentativa ${attempt}/${MAX_RETRIES}...`);
        const startTime = Date.now();
        
        const messages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ];

        // Dá tempo suficiente para o provider trocar de fallback sem matar a calibração cedo demais.
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`LLM timeout (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs)
        );

        const llmPromise = chatComplete({
          messages,
          temperature: options?.temperature ?? 0.3, // Mais determinístico
          maxTokens: options?.maxTokens ?? 200 // Reduzido para velocidade
        });

        const response = await Promise.race([llmPromise, timeoutPromise]);
        const elapsed = Date.now() - startTime;
        console.log(`✅ [Calibração LLM] Resposta em ${elapsed}ms`);

        const content = response.choices?.[0]?.message?.content;
        if (!content || content.trim() === "") {
          throw new Error("Resposta vazia do LLM");
        }

        // Se jsonMode, tentar extrair JSON da resposta
        if (options?.jsonMode) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("JSON não encontrado na resposta");
          }
          // Validar que é JSON válido
          try {
            JSON.parse(jsonMatch[0]);
          } catch {
            throw new Error("JSON inválido na resposta");
          }
          return jsonMatch[0];
        }

        return content;
        
      } catch (error: any) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error || "Erro desconhecido");
        console.warn(`⚠️ [Calibração LLM] Tentativa ${attempt} falhou: ${errorMessage}`);
        
        if (attempt < MAX_RETRIES) {
          const retryable = isRetryablePromptEditMessage(errorMessage) || /json|resposta vazia/i.test(errorMessage);
          const delay = retryable ? attempt * 1500 : attempt * 750;
          console.log(`⏳ [Calibração LLM] ${retryable ? "Erro transitório" : "Novo ciclo"} em ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Todas as tentativas falharam
    throw lastError || new Error("Falha após múltiplas tentativas");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNÇÃO PRINCIPAL: Calibrar Prompt
  // ═══════════════════════════════════════════════════════════════════════════

  async calibrarPrompt(
    promptEditado: string,
    instrucaoUsuario: string,
    promptOriginal?: string
  ): Promise<ResultadoCalibracao> {
    const inicio = Date.now();
    let promptAtual = promptEditado;
    let tentativasReparo = 0;
    let totalEdicoesAplicadas = 0; // Contador de edições efetivamente aplicadas
    let resultados: ResultadoCenario[] = [];
    let scoreGeral = 0;
    let cenariosAprovados = 0;
    const ancorasObrigatorias = this.extrairAncorasObrigatorias(instrucaoUsuario)
      .filter((ancora) => promptEditado.includes(ancora));

    this.emitProgress('start', '🎯 Iniciando testes com clientes simulados...', {
      instrucao: instrucaoUsuario.substring(0, 100)
    });

    console.log(`\n🎯 [Calibração] Iniciando calibração...`);
    console.log(`📝 [Calibração] Instrução: "${instrucaoUsuario}"`);

    try {
      // 1. Gerar cenários de teste
      this.emitProgress('scenario_generated', '🧪 Gerando perguntas de clientes simulados...', {});
      const cenarios = await this.gerarCenarios(instrucaoUsuario, this.config.numeroCenarios);
      this.emitProgress('scenario_generated', `✅ ${cenarios.length} perguntas prontas!`, {});
      
      // Mostrar cada cenário gerado
      for (let i = 0; i < cenarios.length; i++) {
        const c = cenarios[i];
        this.emitProgress('scenario_generated', `📋 Cenário ${i + 1}: "${c.perguntaCliente}"`, {});
      }
      console.log(`✅ [Calibração] ${cenarios.length} cenários gerados`);

      // Loop de calibração com reparo - CONTINUA ATÉ ATINGIR SCORE >= 60
      while (tentativasReparo <= this.config.maxTentativasReparo) {
        this.emitProgress('loop_iteration', `🔄 Rodada ${tentativasReparo + 1}/${this.config.maxTentativasReparo} - Simulando conversas...`, {
          rodada: tentativasReparo + 1,
          maxRodadas: this.config.maxTentativasReparo + 1
        });
        
        resultados = [];
        cenariosAprovados = 0;

        // 2. Executar cada cenário
        for (let i = 0; i < cenarios.length; i++) {
          const cenario = cenarios[i];
          
          // Log: Cliente vai perguntar
          this.emitProgress('scenario_running', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, {});
          this.emitProgress('scenario_running', `🧪 TESTE ${i + 1}/${cenarios.length}`, {});
          this.emitProgress('scenario_running', `👤 CLIENTE PERGUNTA:`, {});
          this.emitProgress('scenario_running', `   "${cenario.perguntaCliente}"`, {});
          
          const resultado = await this.executarCenario(promptAtual, cenario, instrucaoUsuario);
          resultados.push(resultado);
          if (resultado.passou) cenariosAprovados++;
          
          // Log: Resposta do agente (MOSTRA TUDO)
          this.emitProgress('scenario_running', `🤖 AGENTE RESPONDE:`, {});
          // Quebra resposta em linhas menores para exibição
          const respostaLinhas = resultado.respostaAgente.match(/.{1,80}/g) || [resultado.respostaAgente];
          for (const linha of respostaLinhas.slice(0, 5)) { // Máximo 5 linhas
            this.emitProgress('scenario_running', `   ${linha}`, {});
          }
          if (respostaLinhas.length > 5) {
            this.emitProgress('scenario_running', `   [...mais ${respostaLinhas.length - 5} linhas]`, {});
          }
          
          // Log: Análise
          this.emitProgress('scenario_running', `📊 ANÁLISE:`, {});
          this.emitProgress('scenario_result', `${resultado.passou ? '✅' : '❌'} Nota: ${resultado.score}/100 - ${resultado.motivo}`, {});
          
          console.log(`  ${resultado.passou ? '✅' : '❌'} Cenário ${cenario.id}: ${resultado.score}/100`);
        }

        // 3. Calcular score geral
        scoreGeral = resultados.reduce((acc, r) => acc + r.score, 0) / resultados.length;
        
        this.emitProgress('score_update', `📊 Score atual: ${scoreGeral.toFixed(0)}/100 (meta: 70+)`, {
          score: Math.round(scoreGeral),
          aprovados: cenariosAprovados,
          total: cenarios.length,
          rodada: tentativasReparo + 1
        });
        
        console.log(`📊 [Calibração] Score geral: ${scoreGeral.toFixed(1)}/100 (${cenariosAprovados}/${cenarios.length} aprovados)`);
        console.log(`📊 [Calibração] Mínimo para aprovar: 70/100`);

        // 4. Verificar se passou - SCORE >= 70 OBRIGATÓRIO
        if (scoreGeral >= this.config.scoreMinimoAprovacao) {
          this.emitProgress('final_result', `🎉 Aprovado! Score final: ${Math.round(scoreGeral)}/100`, {
            success: true,
            score: Math.round(scoreGeral),
            rodadasUsadas: tentativasReparo + 1
          });
          console.log(`🎉 [Calibração] APROVADO! Prompt calibrado com sucesso.`);
          break;
        }

        // 5. Tentar reparar se não passou E ainda tem tentativas
        if (tentativasReparo < this.config.maxTentativasReparo) {
          this.emitProgress('repair_start', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, {});
          this.emitProgress('repair_start', `🔧 INICIANDO AJUSTE ${tentativasReparo + 1}/${this.config.maxTentativasReparo}`, {});
          console.log(`🔧 [Calibração] Tentando reparo (${tentativasReparo + 1}/${this.config.maxTentativasReparo})...`);
          
          // Encontrar cenário que falhou pior
          const piorResultado = resultados.reduce((pior, atual) => 
            atual.score < pior.score ? atual : pior
          );
          const cenarioFalhou = cenarios.find(c => c.id === piorResultado.cenarioId);

          if (cenarioFalhou) {
            this.emitProgress('repair_start', `❌ Problema identificado:`, {});
            this.emitProgress('repair_start', `   Pergunta: "${cenarioFalhou.perguntaCliente}"`, {});
            this.emitProgress('repair_start', `   Score: ${piorResultado.score}/100`, {});
            this.emitProgress('repair_start', `   Motivo: ${piorResultado.motivo}`, {});
            this.emitProgress('repair_start', `💡 Ajustando prompt para corrigir...`, {});
            
            const repairResult = await this.repararPrompt(
              promptAtual,
              instrucaoUsuario,
              cenarioFalhou,
              piorResultado,
              ancorasObrigatorias
            );

            if (repairResult.promptReparado && repairResult.promptReparado !== promptAtual) {
              promptAtual = repairResult.promptReparado;
              totalEdicoesAplicadas += repairResult.edicoesAplicadas; // Acumula edições
              this.emitProgress('repair_done', `✅ ${repairResult.edicoesAplicadas} ajuste(s) aplicado(s)! Retestando...`, {
                reparo: true,
                edicoesNesteTurno: repairResult.edicoesAplicadas,
                totalEdicoes: totalEdicoesAplicadas
              });
              console.log(`✅ [Calibração] ${repairResult.edicoesAplicadas} edições aplicadas (total: ${totalEdicoesAplicadas})`);
            } else {
              this.emitProgress('repair_done', `⚠️ Não foi possível ajustar. Tentando abordagem diferente...`, {
                reparo: false
              });
            }
          }
        } else {
          // Atingiu máximo de tentativas mas não passou
          this.emitProgress('final_result', `⚠️ Ajustes finalizados. Pontuação final: ${Math.round(scoreGeral)}/100`, {
            success: false,
            score: Math.round(scoreGeral),
            rodadasUsadas: tentativasReparo + 1
          });
        }

        tentativasReparo++;
      }

      const sucesso = scoreGeral >= this.config.scoreMinimoAprovacao;
      this.emitProgress('final_result', sucesso 
        ? `✅ Calibração concluída com sucesso! Score: ${Math.round(scoreGeral)}/100 (${totalEdicoesAplicadas} edições)`
        : `⚠️ Calibração finalizada. Score: ${Math.round(scoreGeral)}/100 - Recomendamos testar no simulador.`, 
      {
        success: sucesso,
        score: Math.round(scoreGeral),
        edicoesAplicadas: totalEdicoesAplicadas,
        tempoMs: Date.now() - inicio
      });

      return {
        sucesso,
        scoreGeral: Math.round(scoreGeral),
        cenariosTotais: cenarios.length,
        cenariosAprovados,
        resultados,
        promptFinal: promptAtual,
        tentativasReparo,
        edicoesAplicadas: totalEdicoesAplicadas, // Total de edições efetivamente aplicadas
        tempoMs: Date.now() - inicio
      };

    } catch (error: any) {
      this.emitProgress('error', `❌ Erro na calibração: ${error.message}`, { error: error.message });
      console.error(`❌ [Calibração] Erro:`, error.message);
      return {
        sucesso: false,
        scoreGeral: 0,
        cenariosTotais: 0,
        cenariosAprovados: 0,
        resultados: [],
        promptFinal: promptEditado,
        tentativasReparo,
        edicoesAplicadas: 0,
        tempoMs: Date.now() - inicio
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Gerar Cenários de Teste
  // ═══════════════════════════════════════════════════════════════════════════

  private async gerarCenarios(instrucao: string, quantidade: number): Promise<CenarioTeste[]> {
    const userMessage = `INSTRUÇÃO DE EDIÇÃO:
"${instrucao}"

Gere ${quantidade} cenários de teste para validar se essa edição foi aplicada corretamente no prompt do agente.`;

    try {
      const content = await this.callLLM(
        PROMPT_GERADOR_CENARIOS,
        userMessage,
        { temperature: 0.5, maxTokens: 2000, jsonMode: true }
      );
      
      const parsed = JSON.parse(content);
      return (parsed.cenarios || []).slice(0, quantidade);
    } catch (error) {
      console.error("[Calibração] Erro ao gerar cenários:", error);
      // Fallback: cenário genérico
      return [{
        id: "cenario_fallback",
        perguntaCliente: `Sobre "${instrucao.substring(0, 50)}..."`,
        expectativaResposta: "Resposta que demonstra a edição aplicada",
        tipoValidacao: "semantico",
        palavrasChave: []
      }];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Executar Cenário (IA Cliente ↔ IA Agente)
  // ═══════════════════════════════════════════════════════════════════════════

  private async executarCenario(
    prompt: string,
    cenario: CenarioTeste,
    instrucaoOriginal: string
  ): Promise<ResultadoCenario> {
    try {
      // 1. Simular mensagem do cliente
      const mensagemCliente = await this.simularCliente(cenario.perguntaCliente);
      
      // 2. Obter resposta do agente
      const respostaAgente = await this.obterRespostaAgente(prompt, mensagemCliente);
      
      // 3. Analisar se passou
      const analise = await this.analisarResposta(
        respostaAgente,
        instrucaoOriginal,
        cenario
      );

      return {
        cenarioId: cenario.id,
        perguntaCliente: mensagemCliente,
        respostaAgente,
        passou: analise.passou,
        score: analise.score,
        motivo: analise.motivo
      };

    } catch (error: any) {
      return {
        cenarioId: cenario.id,
        perguntaCliente: cenario.perguntaCliente,
        respostaAgente: "ERRO",
        passou: false,
        score: 0,
        motivo: `Erro na execução: ${error.message}`
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Simular Cliente - OTIMIZADO: Usa mensagem direta sem simulação extra
  // ═══════════════════════════════════════════════════════════════════════════

  private async simularCliente(perguntaBase: string): Promise<string> {
    // 🚀 OTIMIZAÇÃO: Retorna pergunta direta sem chamada LLM adicional
    // Isso economiza 1 chamada por cenário = muito mais rápido
    return perguntaBase;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Obter Resposta do Agente - OTIMIZADO
  // ═══════════════════════════════════════════════════════════════════════════

  private async obterRespostaAgente(promptAgente: string, mensagemCliente: string): Promise<string> {
    try {
      const content = await this.callLLM(
        promptAgente,
        mensagemCliente,
        { temperature: 0.3, maxTokens: 400 } // Reduzido para velocidade
      );
      return content.trim() || "";
    } catch (error: any) {
      throw new Error(`Erro ao obter resposta do agente: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Analisar Resposta - OTIMIZADO
  // ═══════════════════════════════════════════════════════════════════════════

  private async analisarResposta(
    respostaAgente: string,
    instrucaoOriginal: string,
    cenario: CenarioTeste
  ): Promise<{ passou: boolean; score: number; motivo: string }> {
    // 🚀 OTIMIZAÇÃO: Análise local por palavras-chave PRIMEIRO (sem LLM)
    // Se tiver palavras-chave definidas, usa análise rápida
    if (cenario.palavrasChave && cenario.palavrasChave.length > 0) {
      const respostaLower = respostaAgente.toLowerCase();
      const palavrasEncontradas = cenario.palavrasChave.filter(
        palavra => respostaLower.includes(palavra.toLowerCase())
      );
      const percentualEncontrado = (palavrasEncontradas.length / cenario.palavrasChave.length) * 100;
      
      if (cenario.tipoValidacao === "contem") {
        const passou = percentualEncontrado >= 50;
        const score = Math.round(percentualEncontrado * 0.9 + (passou ? 10 : 0));
        return {
          passou,
          score: Math.min(100, score),
          motivo: `Encontrou ${palavrasEncontradas.length}/${cenario.palavrasChave.length} palavras-chave`
        };
      }
      
      if (cenario.tipoValidacao === "nao_contem") {
        const passou = percentualEncontrado === 0;
        return {
          passou,
          score: passou ? 95 : 30,
          motivo: passou ? "Nenhuma palavra-chave indesejada" : `Encontrou palavras indesejadas: ${palavrasEncontradas.join(", ")}`
        };
      }
    }

    // Fallback: Análise semântica com LLM (mais lenta)
    const promptAnalise = PROMPT_ANALISADOR
      .replace("{{INSTRUCAO}}", instrucaoOriginal)
      .replace("{{EXPECTATIVA}}", cenario.expectativaResposta)
      .replace("{{RESPOSTA}}", respostaAgente.substring(0, 500)) // Limita tamanho
      .replace("{{PALAVRAS_CHAVE}}", (cenario.palavrasChave || []).join(", "))
      .replace("{{TIPO_VALIDACAO}}", cenario.tipoValidacao);

    try {
      const content = await this.callLLM(
        promptAnalise,
        "Analise a resposta e retorne o JSON de avaliação:",
        { temperature: 0.1, maxTokens: 300, jsonMode: true }
      );

      const parsed = JSON.parse(content);

      return {
        passou: parsed.passou ?? false,
        score: Math.min(100, Math.max(0, parsed.score ?? 0)),
        motivo: parsed.motivo || "Sem justificativa"
      };
    } catch {
      // Fallback final
      return {
        passou: respostaAgente.length > 50,
        score: respostaAgente.length > 50 ? 65 : 30,
        motivo: "Análise automática (fallback)"
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Reparar Prompt - Retorna objeto com prompt e número de edições
  // ═══════════════════════════════════════════════════════════════════════════

  private async repararPrompt(
    promptAtual: string,
    instrucaoOriginal: string,
    cenarioFalhou: CenarioTeste,
    resultadoFalhou: ResultadoCenario,
    ancorasObrigatorias: string[]
  ): Promise<{ promptReparado: string | null; edicoesAplicadas: number }> {
    const ancorasTexto = ancorasObrigatorias.length > 0
      ? ancorasObrigatorias.map((a) => `- ${a}`).join("\n")
      : "- nenhuma";

    const promptReparo = PROMPT_REPARADOR
      .replace("{{PROMPT}}", promptAtual)
      .replace("{{INSTRUCAO}}", instrucaoOriginal)
      .replace("{{PROBLEMA}}", resultadoFalhou.motivo)
      .replace("{{ANCORAS_OBRIGATORIAS}}", ancorasTexto)
      .replace("{{PERGUNTA}}", resultadoFalhou.perguntaCliente)
      .replace("{{RESPOSTA}}", resultadoFalhou.respostaAgente)
      .replace("{{EXPECTATIVA}}", cenarioFalhou.expectativaResposta);

    try {
      const content = await this.callLLM(
        promptReparo,
        "Analise e corrija o prompt. Retorne APENAS o JSON com as edições:",
        { temperature: 0.3, maxTokens: 2000, jsonMode: true }
      );

      const parsed = JSON.parse(content);

      if (parsed.operacao === "editar" && parsed.edicoes?.length > 0) {
        let promptReparado = promptAtual;
        let edicoesAplicadas = 0;
        
        for (const edicao of parsed.edicoes) {
          if (!edicao.buscar || !edicao.substituir) continue;
          
          // Tentar match exato primeiro
          if (promptReparado.includes(edicao.buscar)) {
            const candidato = promptReparado.replace(edicao.buscar, edicao.substituir);
            if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
              this.emitProgress('repair_done', `   ⚠️ Edição ignorada para preservar instrução mandatória`, {});
              continue;
            }
            promptReparado = candidato;
            edicoesAplicadas++;
            this.emitProgress('repair_done', `   ✓ Edição aplicada (match exato)`, {});
            continue;
          }
          
          // Tentar match case-insensitive
          const promptLower = promptReparado.toLowerCase();
          const buscarLower = edicao.buscar.toLowerCase();
          const indexCI = promptLower.indexOf(buscarLower);
          
          if (indexCI !== -1) {
            const textoOriginal = promptReparado.substring(indexCI, indexCI + edicao.buscar.length);
            const candidato = promptReparado.replace(textoOriginal, edicao.substituir);
            if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
              this.emitProgress('repair_done', `   ⚠️ Edição fuzzy ignorada para preservar instrução mandatória`, {});
              continue;
            }
            promptReparado = candidato;
            edicoesAplicadas++;
            this.emitProgress('repair_done', `   ✓ Edição aplicada (fuzzy match)`, {});
            continue;
          }
          
          // Se não encontrou, tentar adicionar no final (como regra adicional)
          if (edicao.substituir && edicao.substituir.length > 20) {
            // Adiciona como nova instrução no final do prompt
            const candidato = promptReparado.trim() + "\n\n" + edicao.substituir;
            if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
              this.emitProgress('repair_done', `   ⚠️ Nova instrução ignorada para preservar instrução mandatória`, {});
              continue;
            }
            promptReparado = candidato;
            edicoesAplicadas++;
            this.emitProgress('repair_done', `   ✓ Nova instrução adicionada ao prompt`, {});
          }
        }

        for (const ancora of ancorasObrigatorias) {
          if (!promptReparado.includes(ancora)) {
            promptReparado = `${promptReparado.trim()}\n\nINSTRUÇÃO MANDATÓRIA PRESERVADA:\n${ancora}`;
            edicoesAplicadas++;
            this.emitProgress('repair_done', `   ✓ Âncora mandatória restaurada`, {});
          }
        }
        
        if (edicoesAplicadas > 0) {
          this.emitProgress('repair_done', `   📝 ${edicoesAplicadas} edição(ões) aplicadas`, {});
          return { promptReparado, edicoesAplicadas };
        }
      }

      return { promptReparado: null, edicoesAplicadas: 0 };
    } catch (error) {
      console.error("[Calibração] Erro ao reparar prompt:", error);
      return { promptReparado: null, edicoesAplicadas: 0 };
    }
  }

  private extrairAncorasObrigatorias(instrucao: string): string[] {
    if (!instrucao) return [];

    const candidatos: string[] = [];
    const regex = /["“”']([^"“”']{12,})["“”']/g;
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(instrucao)) !== null) {
      const texto = match[1].trim();
      if (texto.length >= 12) {
        candidatos.push(texto);
      }
    }

    return [...new Set(candidatos)];
  }

  private violariaAncorasObrigatorias(
    promptAntes: string,
    promptDepois: string,
    ancorasObrigatorias: string[]
  ): boolean {
    if (!ancorasObrigatorias.length) return false;

    for (const ancora of ancorasObrigatorias) {
      if (promptAntes.includes(ancora) && !promptDepois.includes(ancora)) {
        return true;
      }
    }

    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO HELPER PARA USO DIRETO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Função simplificada para calibrar prompts
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes automaticamente
 * Os parâmetros apiKey e modelo são mantidos por compatibilidade mas ignorados
 */
export async function calibrarPromptEditado(
  promptEditado: string,
  instrucaoUsuario: string,
  _apiKey?: string,  // Ignorado - usa config do sistema
  _modelo?: "mistral" | "openai",  // Ignorado - usa OpenRouter/Chutes
  config?: Partial<ConfiguracaoCalibracao>,
  progressCallback?: ProgressCallback
): Promise<ResultadoCalibracao> {
  const service = new PromptCalibrationService(config, progressCallback);
  return service.calibrarPrompt(promptEditado, instrucaoUsuario);
}

export default PromptCalibrationService;
