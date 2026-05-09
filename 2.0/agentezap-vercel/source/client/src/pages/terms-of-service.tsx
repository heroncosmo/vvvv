import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Scale, Shield, AlertTriangle, CreditCard, XCircle, Users, Gavel } from "lucide-react";
import { Link } from "wouter";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header minimalista */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="container max-w-4xl mx-auto py-4 px-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <span className="text-xs text-slate-400 font-medium">
            Atualizado em 10 de Janeiro de 2026
          </span>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto py-12 px-4">
        {/* Título do documento */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 text-white mb-6">
            <FileText className="h-8 w-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Termos de Uso
          </h1>
          <p className="text-slate-500 mt-3 text-lg">
            Contrato de Prestação de Serviços — AgenteZap
          </p>
        </div>

        {/* Índice navegável */}
        <nav className="mb-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Índice
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { id: "privacy", icon: Shield, label: "Política de Privacidade" },
              { id: "1", icon: Scale, label: "Objeto do Contrato" },
              { id: "2", icon: FileText, label: "Funcionalidades" },
              { id: "3", icon: Shield, label: "Diretrizes de Uso" },
              { id: "4", icon: AlertTriangle, label: "Suspensão e Estorno" },
              { id: "5", icon: Users, label: "Obrigações das Partes" },
              { id: "6", icon: CreditCard, label: "Pagamentos" },
              { id: "7", icon: XCircle, label: "Rescisão" },
              { id: "8", icon: Gavel, label: "Disposições Finais" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#sec-${item.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all group"
              >
                <item.icon className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                <span>{item.id === "privacy" ? "" : `${item.id}.`} {item.label}</span>
              </a>
            ))}
          </div>
        </nav>

        {/* Conteúdo do Contrato */}
        <article className="space-y-10">
          
          {/* Política de Privacidade */}
          <section id="sec-privacy" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white">
                <Shield className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                Política de Privacidade e Proteção de Dados
              </h2>
            </div>
            <div className="pl-13 space-y-6 text-slate-600 leading-relaxed">
              
              {/* Introdução */}
              <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-blue-900 font-medium mb-2">
                  Compromisso com a Privacidade
                </p>
                <p className="text-sm text-blue-800">
                  A AgenteZap está comprometida com a proteção e privacidade dos dados dos seus usuários.
                  Esta política descreve de forma transparente como coletamos, armazenamos, utilizamos e protegemos suas informações,
                  em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018) e as políticas do Google.
                </p>
              </div>

              {/* Dados Coletados */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  1. Dados Coletados
                </h3>
                
                <div className="space-y-4 ml-4">
                  <div>
                    <p className="font-semibold text-slate-800 mb-2">1.1. Dados de Cadastro</p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li><strong>Nome completo:</strong> para identificação do usuário</li>
                      <li><strong>E-mail:</strong> para comunicação, recuperação de conta e notificações</li>
                      <li><strong>Telefone:</strong> para suporte técnico e autenticação</li>
                      <li><strong>Dados de pagamento:</strong> processados via Stripe (não armazenamos dados de cartão)</li>
                      <li><strong>Informações do negócio:</strong> nome, tipo de negócio, endereço (quando aplicável)</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-2">1.2. Dados de Uso da Plataforma</p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li><strong>Conversas do WhatsApp:</strong> mensagens trocadas através do agente de IA</li>
                      <li><strong>Mídias enviadas/recebidas:</strong> imagens, áudios, vídeos e documentos</li>
                      <li><strong>Logs de atividade:</strong> horários de acesso, ações realizadas no sistema</li>
                      <li><strong>Dados de leads:</strong> informações coletadas dos contatos via WhatsApp</li>
                      <li><strong>Configurações do agente:</strong> prompts personalizados, flows, automações</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-900 mb-2">1.3. Dados do Google Calendar (Integrações OAuth)</p>
                    <p className="text-sm text-green-800 mb-3">
                      Quando você autoriza a integração com o Google Calendar, a AgenteZap acessa os seguintes dados:
                    </p>
                    <ul className="space-y-1 text-sm text-green-800 list-disc list-inside ml-4">
                      <li><strong>Eventos do calendário:</strong> títulos, descrições, datas e horários de compromissos</li>
                      <li><strong>Informações de disponibilidade:</strong> horários livres/ocupados para agendamento</li>
                      <li><strong>Detalhes de participantes:</strong> e-mails e nomes de convidados (quando necessário)</li>
                      <li><strong>Configurações do calendário:</strong> fuso horário, preferências de notificação</li>
                    </ul>
                    <p className="text-xs text-green-700 mt-3 italic">
                      Importante: O acesso ao Google Calendar é opcional e requer sua autorização explícita.
                      Você pode revogar esse acesso a qualquer momento através das configurações da sua conta Google.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-2">1.4. Dados Técnicos</p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li><strong>Endereço IP:</strong> para segurança e prevenção de fraudes</li>
                      <li><strong>Informações do dispositivo:</strong> tipo de navegador, sistema operacional</li>
                      <li><strong>Cookies:</strong> para manter sessão ativa e melhorar a experiência</li>
                    </ul>
                  </div>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Como Utilizamos os Dados */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  2. Como Utilizamos os Dados
                </h3>
                
                <div className="space-y-4 ml-4">
                  <div>
                    <p className="font-semibold text-slate-800 mb-2">2.1. Finalidades Gerais</p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li>Fornecimento e operação da plataforma AgenteZap</li>
                      <li>Processamento de mensagens via inteligência artificial</li>
                      <li>Gestão de conversas e histórico de atendimentos</li>
                      <li>Automação de follow-ups e qualificação de leads</li>
                      <li>Geração de relatórios e estatísticas de uso</li>
                      <li>Suporte técnico e atendimento ao cliente</li>
                      <li>Envio de notificações importantes sobre o serviço</li>
                      <li>Processamento de pagamentos e faturas</li>
                      <li>Melhoria contínua da plataforma e desenvolvimento de novos recursos</li>
                      <li>Prevenção de fraudes e garantia de segurança</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-900 mb-2">2.2. Uso Específico dos Dados do Google Calendar</p>
                    <p className="text-sm text-green-800 mb-3">
                      Os dados acessados do seu Google Calendar são utilizados exclusivamente para:
                    </p>
                    <ul className="space-y-1 text-sm text-green-800 list-disc list-inside ml-4">
                      <li><strong>Agendamento automático:</strong> Permitir que o agente de IA agende compromissos diretamente no seu calendário quando solicitado por clientes via WhatsApp</li>
                      <li><strong>Verificação de disponibilidade:</strong> Consultar seus horários livres para sugerir opções de agendamento aos clientes</li>
                      <li><strong>Criação de eventos:</strong> Criar novos compromissos no calendário com as informações fornecidas pelo cliente</li>
                      <li><strong>Atualização de eventos:</strong> Modificar ou cancelar agendamentos quando necessário</li>
                      <li><strong>Sincronização de agenda:</strong> Manter a agenda do WhatsApp sincronizada com o Google Calendar</li>
                      <li><strong>Lembretes automáticos:</strong> Enviar notificações de compromissos agendados aos clientes via WhatsApp</li>
                    </ul>
                    <p className="text-xs text-green-700 mt-3 font-medium">
                      ⚠️ Garantia de Privacidade: NÃO compartilhamos, vendemos ou utilizamos os dados do seu Google Calendar
                      para nenhuma finalidade além das listadas acima. Seus eventos e compromissos são estritamente
                      confidenciais e utilizados apenas para operar a funcionalidade de agendamento da plataforma.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-2">2.3. Processamento de IA</p>
                    <p className="text-sm text-slate-600 mb-2">
                      As mensagens enviadas e recebidas via WhatsApp são processadas por inteligência artificial (OpenAI GPT-4) para:
                    </p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li>Compreender e responder perguntas dos clientes</li>
                      <li>Qualificar leads e extrair informações relevantes</li>
                      <li>Executar fluxos de atendimento personalizados</li>
                      <li>Agendar compromissos e criar lembretes</li>
                    </ul>
                    <p className="text-xs text-slate-500 mt-2 italic">
                      Nota: Utilizamos a OpenAI API que possui suas próprias políticas de privacidade e não utiliza
                      os dados enviados via API para treinar seus modelos.
                    </p>
                  </div>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Armazenamento e Segurança */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  3. Armazenamento e Segurança dos Dados
                </h3>
                
                <div className="space-y-4 ml-4">
                  <div>
                    <p className="font-semibold text-slate-800 mb-2">3.1. Onde Armazenamos</p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li><strong>Banco de dados principal:</strong> Supabase (infraestrutura AWS, servidores nos EUA)</li>
                      <li><strong>Mídias e arquivos:</strong> Supabase Storage com CDN global</li>
                      <li><strong>Backups:</strong> Realizados diariamente com criptografia</li>
                      <li><strong>Logs de sistema:</strong> Armazenados por 90 dias para auditoria</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-900 mb-2">3.2. Dados do Google Calendar</p>
                    <ul className="space-y-1 text-sm text-green-800 list-disc list-inside ml-4">
                      <li><strong>Tokens de acesso:</strong> Armazenados com criptografia AES-256 no Supabase</li>
                      <li><strong>Cache de eventos:</strong> Mantido temporariamente (máximo 24h) apenas para performance</li>
                      <li><strong>Sincronização:</strong> Dados são consultados em tempo real quando necessário, não mantemos cópias permanentes</li>
                      <li><strong>Revogação:</strong> Ao desconectar a integração, todos os tokens e caches são imediatamente deletados</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-2">3.3. Medidas de Segurança</p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li><strong>Criptografia em trânsito:</strong> TLS/SSL 1.3 para todas as comunicações</li>
                      <li><strong>Criptografia em repouso:</strong> AES-256 para dados sensíveis no banco</li>
                      <li><strong>Autenticação segura:</strong> Supabase Auth com tokens JWT</li>
                      <li><strong>Row Level Security (RLS):</strong> Isolamento total de dados entre contas</li>
                      <li><strong>Monitoramento 24/7:</strong> Detecção de atividades suspeitas e tentativas de acesso não autorizado</li>
                      <li><strong>Auditorias regulares:</strong> Análise de vulnerabilidades e testes de penetração</li>
                      <li><strong>Acessos restritos:</strong> Equipe técnica possui acesso limitado apenas quando necessário</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-2">3.4. Período de Retenção</p>
                    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                      <li><strong>Dados da conta ativa:</strong> Mantidos enquanto a assinatura estiver ativa</li>
                      <li><strong>Após cancelamento:</strong> Dados mantidos por 30 dias para possível reativação</li>
                      <li><strong>Exclusão definitiva:</strong> Após 30 dias, todos os dados são permanentemente deletados</li>
                      <li><strong>Dados fiscais:</strong> Mantidos por 5 anos conforme legislação brasileira</li>
                      <li><strong>Logs de segurança:</strong> Mantidos por 90 dias para auditoria</li>
                    </ul>
                  </div>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Compartilhamento de Dados */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  4. Compartilhamento de Dados
                </h3>
                
                <div className="space-y-4 ml-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-amber-900 font-medium mb-2">
                      Importante: NÃO vendemos seus dados a terceiros
                    </p>
                    <p className="text-sm text-amber-800">
                      A AgenteZap NUNCA vende, aluga ou comercializa dados pessoais dos usuários.
                      Compartilhamos dados apenas quando estritamente necessário para operação do serviço.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-2">4.1. Serviços Essenciais de Terceiros</p>
                    <p className="text-sm text-slate-600 mb-2">
                      Compartilhamos dados limitados com os seguintes parceiros para operação da plataforma:
                    </p>
                    <ul className="space-y-2 text-sm text-slate-600 ml-4">
                      <li>
                        <strong>Supabase:</strong> Hospedagem de banco de dados e armazenamento de arquivos
                        <br />
                        <span className="text-xs text-slate-500">Política: https://supabase.com/privacy</span>
                      </li>
                      <li>
                        <strong>OpenAI:</strong> Processamento de IA para respostas do agente
                        <br />
                        <span className="text-xs text-slate-500">Política: https://openai.com/privacy</span>
                      </li>
                      <li>
                        <strong>Stripe:</strong> Processamento de pagamentos
                        <br />
                        <span className="text-xs text-slate-500">Política: https://stripe.com/privacy</span>
                      </li>
                      <li>
                        <strong>Evolution API:</strong> Infraestrutura para integração com WhatsApp
                        <br />
                        <span className="text-xs text-slate-500">Auto-hospedado com criptografia end-to-end</span>
                      </li>
                      <li>
                        <strong>Google Calendar API:</strong> Sincronização de agendamentos
                        <br />
                        <span className="text-xs text-slate-500">Política: https://policies.google.com/privacy</span>
                      </li>
                      <li>
                        <strong>Railway:</strong> Hospedagem de servidores e deploy de aplicações
                        <br />
                        <span className="text-xs text-slate-500">Política: https://railway.app/legal/privacy</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-900 mb-2">4.2. Política Específica de Dados do Google</p>
                    <p className="text-sm text-green-800 mb-2">
                      Em conformidade com a Google API Services User Data Policy, garantimos que:
                    </p>
                    <ul className="space-y-1 text-sm text-green-800 list-disc list-inside ml-4">
                      <li>Os dados do Google Calendar são acessados APENAS para as funcionalidades de agendamento descritas</li>
                      <li>NÃO transferimos dados do Google Calendar para terceiros</li>
                      <li>NÃO utilizamos os dados para publicidade ou marketing</li>
                      <li>NÃO permitimos que humanos leiam seus dados, exceto quando necessário para segurança ou suporte (com seu consentimento)</li>
                      <li>Implementamos criptografia em trânsito e em repouso para todos os dados do Google</li>
                      <li>Você pode revogar o acesso a qualquer momento através das configurações da sua conta Google</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-2">4.3. Situações Legais</p>
                    <p className="text-sm text-slate-600">
                      Podemos divulgar dados pessoais quando exigido por lei, ordem judicial, ou autoridade competente,
                      ou quando necessário para proteger nossos direitos, segurança ou propriedade.
                    </p>
                  </div>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Direitos do Usuário */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  5. Seus Direitos (LGPD)
                </h3>
                
                <div className="space-y-4 ml-4">
                  <p className="text-sm text-slate-600">
                    De acordo com a LGPD, você possui os seguintes direitos sobre seus dados pessoais:
                  </p>
                  
                  <ul className="space-y-2 text-sm text-slate-600 ml-4">
                    <li>
                      <strong>Acesso:</strong> Solicitar cópia de todos os dados pessoais que mantemos sobre você
                    </li>
                    <li>
                      <strong>Correção:</strong> Atualizar ou corrigir dados incorretos ou desatualizados
                    </li>
                    <li>
                      <strong>Exclusão:</strong> Solicitar a exclusão definitiva de seus dados (direito ao esquecimento)
                    </li>
                    <li>
                      <strong>Portabilidade:</strong> Receber seus dados em formato estruturado para transferência
                    </li>
                    <li>
                      <strong>Revogação de consentimento:</strong> Retirar autorização para processamento de dados a qualquer momento
                    </li>
                    <li>
                      <strong>Anonimização:</strong> Solicitar que seus dados sejam anonimizados
                    </li>
                    <li>
                      <strong>Informação:</strong> Conhecer quais dados coletamos e como os utilizamos
                    </li>
                  </ul>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mt-4">
                    <p className="font-semibold text-blue-900 mb-2">Como Exercer Seus Direitos</p>
                    <p className="text-sm text-blue-800 mb-2">
                      Para exercer qualquer um desses direitos, você pode:
                    </p>
                    <ul className="space-y-1 text-sm text-blue-800 list-disc list-inside ml-4">
                      <li>Acessar as configurações da sua conta no painel administrativo</li>
                      <li>Entrar em contato com nosso suporte através do chat da plataforma</li>
                      <li>Enviar um e-mail para: privacidade@agentezap.online</li>
                    </ul>
                    <p className="text-xs text-blue-700 mt-2">
                      Responderemos todas as solicitações em até 15 dias úteis.
                    </p>
                  </div>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Cookies */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  6. Cookies e Tecnologias Similares
                </h3>
                
                <div className="space-y-4 ml-4">
                  <p className="text-sm text-slate-600">
                    Utilizamos cookies para melhorar sua experiência na plataforma:
                  </p>
                  
                  <ul className="space-y-2 text-sm text-slate-600 ml-4">
                    <li>
                      <strong>Cookies essenciais:</strong> Necessários para login e funcionamento básico (não podem ser desativados)
                    </li>
                    <li>
                      <strong>Cookies de preferência:</strong> Salvam suas configurações e preferências
                    </li>
                    <li>
                      <strong>Cookies de analytics:</strong> Ajudam a entender como você usa a plataforma (podem ser desativados)
                    </li>
                  </ul>

                  <p className="text-xs text-slate-500 mt-2">
                    Você pode gerenciar cookies através das configurações do seu navegador.
                  </p>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Atualizações */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  7. Alterações nesta Política
                </h3>
                
                <div className="space-y-4 ml-4">
                  <p className="text-sm text-slate-600">
                    Podemos atualizar esta Política de Privacidade periodicamente para refletir mudanças em nossas
                    práticas ou na legislação. Quando houver alterações significativas:
                  </p>
                  
                  <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                    <li>Notificaremos você por e-mail</li>
                    <li>Exibiremos um aviso destacado na plataforma</li>
                    <li>A data de "última atualização" será modificada</li>
                  </ul>

                  <p className="text-sm text-slate-600 mt-2">
                    Recomendamos revisar esta política periodicamente para estar sempre informado sobre como
                    protegemos seus dados.
                  </p>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Contato */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">
                  8. Encarregado de Dados (DPO)
                </h3>
                
                <div className="space-y-4 ml-4">
                  <p className="text-sm text-slate-600">
                    Para questões relacionadas à privacidade e proteção de dados, entre em contato com nosso Encarregado:
                  </p>
                  
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-sm text-slate-700">
                      <strong>E-mail:</strong> privacidade@agentezap.online<br />
                      <strong>Assunto:</strong> "LGPD - [Sua Solicitação]"
                    </p>
                  </div>
                </div>
              </div>

              {/* Conformidade Google */}
              <div className="p-5 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-xl mt-6">
                <div className="flex items-start gap-3">
                  <Shield className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-green-900 mb-2">
                      Conformidade com Google API Services User Data Policy
                    </p>
                    <p className="text-sm text-green-800 mb-3">
                      O uso da AgenteZap de informações recebidas das APIs do Google está em conformidade com a
                      <a href="https://developers.google.com/terms/api-services-user-data-policy" 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="underline hover:text-green-900 ml-1">
                        Google API Services User Data Policy
                      </a>, incluindo os requisitos de Uso Limitado.
                    </p>
                    <p className="text-xs text-green-700 italic">
                      Última atualização: 20 de Janeiro de 2026
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <hr className="border-slate-200" />
          
          {/* Seção 1 */}
          <section id="sec-1" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                1
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Objeto do Contrato
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">1.1.</strong> O presente instrumento ("Contrato") estabelece 
                as condições gerais para utilização da plataforma AgenteZap ("Plataforma"), 
                ferramenta de automação de atendimento via WhatsApp com inteligência artificial.
              </p>
              <p>
                <strong className="text-slate-700">1.2.</strong> Ao utilizar a Plataforma, o CONTRATANTE declara 
                ter lido, compreendido e aceito integralmente todos os termos deste Contrato.
              </p>
              <p>
                <strong className="text-slate-700">1.3.</strong> A Plataforma destina-se exclusivamente ao uso 
                comercial e profissional, em conformidade com a legislação vigente e as diretrizes 
                estabelecidas pela AgenteZap.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 2 */}
          <section id="sec-2" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                2
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Funcionalidades da Plataforma
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">2.1.</strong> A Plataforma disponibiliza as seguintes funcionalidades:
              </p>
              <ul className="space-y-2 text-slate-600 list-disc list-inside ml-4">
                <li>Agente de IA para atendimento automatizado via WhatsApp</li>
                <li>Sistema de Follow-up inteligente para reengajamento de leads</li>
                <li>Gestão de conversas e histórico de mensagens</li>
                <li>Sistema de Kanban para gestão de leads</li>
                <li>Biblioteca de mídias (áudios, imagens, vídeos)</li>
                <li>Envio em massa com controle de limites</li>
                <li>Sistema de agendamentos</li>
                <li>Qualificação automática de leads</li>
                <li>Integrações via webhooks</li>
                <li>Relatórios e estatísticas</li>
              </ul>
              <p>
                <strong className="text-slate-700">2.2.</strong> Todas as funcionalidades são destinadas 
                a auxiliar negócios legítimos em suas operações comerciais.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 3 - Diretrizes de Uso */}
          <section id="sec-3" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                3
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Diretrizes de Uso
              </h2>
            </div>
            <div className="pl-11 space-y-6 text-slate-600 leading-relaxed">
              
              {/* Aviso importante */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-amber-800 text-sm font-medium">
                  ⚠️ O descumprimento das diretrizes abaixo pode resultar em suspensão imediata da conta.
                </p>
              </div>

              <p>
                <strong className="text-slate-700">3.1.</strong> É vedada a utilização da Plataforma para:
              </p>

              {/* Categoria 1 - Serviços não alinhados */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-800 mb-2">
                  3.1.1. Categorias de serviço não contempladas
                </p>
                <p className="text-sm text-slate-500 mb-3">
                  Determinadas categorias de serviços não estão contempladas em nossas diretrizes de uso. 
                  Esta classificação reflete exclusivamente os critérios internos da plataforma e não 
                  representa juízo de valor sobre as atividades em si. Os serviços abaixo não são 
                  suportados pela AgenteZap:
                </p>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                  <li>Consultas ou atendimentos de natureza espiritual, mística ou esotérica</li>
                  <li>Serviços de cartomancia, tarô, astrologia ou similares</li>
                  <li>Práticas ritualísticas ou cerimoniais de qualquer natureza</li>
                  <li>Serviços que prometam resultados em âmbitos amorosos, financeiros ou de saúde através de meios não convencionais</li>
                </ul>
              </div>

              {/* Categoria 2 - Conteúdo proibido */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-800 mb-2">
                  3.1.2. Conteúdo adulto e atividades ilegais
                </p>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                  <li>Pornografia ou conteúdo sexualmente explícito</li>
                  <li>Prostituição ou serviços de acompanhantes</li>
                  <li>Venda ou promoção de substâncias ilícitas</li>
                  <li>Jogos de azar não regulamentados</li>
                  <li>Comercialização de produtos contrabandeados ou falsificados</li>
                </ul>
              </div>

              {/* Categoria 3 - Práticas abusivas */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-800 mb-2">
                  3.1.3. Práticas abusivas
                </p>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                  <li>Golpes, fraudes ou esquemas de pirâmide financeira</li>
                  <li>Spam em massa ou mensagens não solicitadas</li>
                  <li>Phishing ou coleta ilegal de dados pessoais</li>
                  <li>Assédio, bullying ou intimidação</li>
                  <li>Discurso de ódio ou discriminação</li>
                  <li>Disseminação de notícias falsas ou desinformação</li>
                </ul>
              </div>

              <p>
                <strong className="text-slate-700">3.2.</strong> A Plataforma monitora ativamente 
                padrões de uso. Contas que violarem estas diretrizes serão suspensas automaticamente 
                e terão o WhatsApp desconectado imediatamente.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 4 - Suspensão e Estorno */}
          <section id="sec-4" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                4
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Suspensão de Conta e Política de Estorno
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">4.1.</strong> A CONTRATADA reserva-se o direito de 
                suspender imediatamente qualquer conta que viole os termos deste Contrato, sem 
                necessidade de aviso prévio.
              </p>
              <p>
                <strong className="text-slate-700">4.2.</strong> Em casos de suspensão por violação de políticas:
              </p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Todas as funcionalidades da conta serão desativadas</li>
                <li>O WhatsApp será desconectado automaticamente</li>
                <li>O Agente de IA deixará de responder</li>
                <li>O sistema de Follow-up será interrompido</li>
                <li>O acesso ao painel administrativo será bloqueado</li>
                <li>Não será possível reconectar o WhatsApp ou enviar mensagens</li>
              </ul>
              <p>
                <strong className="text-slate-700">4.3. Política de estorno:</strong> Em caso de 
                suspensão definitiva por violação de políticas, a CONTRATADA realizará o estorno 
                proporcional do valor pago referente ao período não utilizado, descontando:
              </p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Dias já utilizados do plano</li>
<li>Custos de API já consumidos</li>
              </ul>
              <p>
                <strong className="text-slate-700">4.4.</strong> O estorno será processado em até 
                15 (quinze) dias úteis na mesma forma de pagamento utilizada na contratação.
              </p>
              <p>
                <strong className="text-slate-700">4.5.</strong> A suspensão da conta não exime o 
                CONTRATANTE de responsabilidades legais decorrentes do uso indevido da Plataforma.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 5 - Obrigações */}
          <section id="sec-5" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                5
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Obrigações das Partes
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p><strong className="text-slate-700">5.1. Obrigações do CONTRATANTE:</strong></p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Utilizar a Plataforma conforme as leis aplicáveis e as diretrizes da AgenteZap</li>
                <li>Manter suas credenciais de acesso em sigilo</li>
                <li>Respeitar os limites de uso do plano contratado</li>
                <li>Não compartilhar ou revender acesso à Plataforma</li>
                <li>Manter seus dados cadastrais atualizados</li>
                <li>Respeitar as políticas do WhatsApp</li>
              </ul>
              <p><strong className="text-slate-700">5.2. Obrigações da CONTRATADA:</strong></p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Garantir disponibilidade mínima de 99% da Plataforma</li>
                <li>Fornecer suporte técnico em horário comercial</li>
                <li>Manter a confidencialidade dos dados do CONTRATANTE</li>
                <li>Comunicar manutenções programadas com antecedência</li>
                <li>Processar estornos conforme política estabelecida</li>
              </ul>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 6 - Pagamentos */}
          <section id="sec-6" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                6
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Pagamentos e Renovação
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">6.1.</strong> Os planos são cobrados de forma 
                recorrente (mensal ou anual), conforme opção escolhida pelo CONTRATANTE.
              </p>
              <p>
                <strong className="text-slate-700">6.2.</strong> O pagamento deve ser realizado até 
                a data de vencimento. Atrasos superiores a 5 (cinco) dias podem resultar em 
                suspensão temporária do serviço.
              </p>
              <p>
                <strong className="text-slate-700">6.3.</strong> A renovação é automática, podendo 
                o CONTRATANTE cancelar a qualquer momento através do painel administrativo.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 7 - Rescisão */}
          <section id="sec-7" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                7
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Rescisão e Cancelamento
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">7.1.</strong> O CONTRATANTE pode cancelar sua 
                assinatura a qualquer momento, sem multa, continuando a ter acesso ao serviço 
                até o final do período pago.
              </p>
              <p>
                <strong className="text-slate-700">7.2.</strong> A CONTRATADA pode rescindir o 
                contrato imediatamente em caso de violação dos termos de uso, sem direito a 
                restituição integral.
              </p>
              <p>
                <strong className="text-slate-700">7.3.</strong> Em caso de rescisão por violação 
                de políticas, aplica-se a política de estorno descrita na Seção 4.3.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 8 - Disposições Finais */}
          <section id="sec-8" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                8
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Disposições Finais
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">8.1.</strong> Este Contrato será regido pelas 
                leis da República Federativa do Brasil.
              </p>
              <p>
                <strong className="text-slate-700">8.2.</strong> Fica eleito o foro da comarca de 
                São Paulo/SP para dirimir quaisquer dúvidas ou controvérsias oriundas deste Contrato.
              </p>
              <p>
                <strong className="text-slate-700">8.3.</strong> A tolerância de uma parte quanto 
                a qualquer violação deste Contrato não constituirá renúncia ao direito de exigir 
                seu cumprimento.
              </p>
              <p>
                <strong className="text-slate-700">8.4.</strong> Em caso de dúvidas, o CONTRATANTE 
                pode entrar em contato através do suporte da Plataforma.
              </p>
            </div>
          </section>

          {/* Declaração de aceite */}
          <div className="mt-12 p-6 bg-slate-900 text-white rounded-2xl text-center">
            <p className="text-slate-300 text-sm leading-relaxed">
              Ao utilizar a Plataforma AgenteZap, você declara estar ciente e de acordo 
              com todos os termos e condições aqui estabelecidos.
            </p>
          </div>
        </article>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-400">
            © 2026 AgenteZap — Todos os direitos reservados
          </p>
          <p className="text-xs text-slate-300 mt-2">
            Dúvidas? Entre em contato com nosso suporte.
          </p>
        </footer>
      </main>
    </div>
  );
}
