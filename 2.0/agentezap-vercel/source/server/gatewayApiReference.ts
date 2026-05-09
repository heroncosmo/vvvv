export type GatewayApiExample = {
  title: string;
  value: Record<string, unknown>;
};

export type GatewayApiEndpointReference = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  aliases?: string[];
  queryExample?: Record<string, unknown>;
  requestExample?: GatewayApiExample | null;
  responseExample?: GatewayApiExample | null;
};

export type GatewayApiCategoryReference = {
  id: string;
  title: string;
  description: string;
  endpoints: GatewayApiEndpointReference[];
};

const SAMPLE_INSTANCE_ID = "wa_instance_01";
const SAMPLE_CONNECTION_NAME = "Conexao Principal";
const SAMPLE_CONVERSATION_ID = "conv_9f2df5";
const SAMPLE_MESSAGE_ID = "3EB0A1B2C3D4E5F6";
const SAMPLE_GROUP_ID = "120363402211111111@g.us";
const SAMPLE_WEBHOOK_ID = "wh_01JZ7A8B9C";

const sampleInstanceStatus = {
  instanceId: SAMPLE_INSTANCE_ID,
  phoneNumber: "5511999999999",
  isConnected: true,
  qrCode: null,
  provider: "baileys",
  providerStatus: "connected",
};

const sampleInstanceDevice = {
  instanceId: SAMPLE_INSTANCE_ID,
  connectedPhone: "5511999999999",
  name: "AgenteZap Gateway",
  platform: "baileys",
  lid: null,
  profilePictureUrl: null,
  status: "connected",
  isBusiness: null,
};

export const gatewayApiReference = {
  title: "AgenteZap Gateway API Reference",
  version: "v1",
  auth: {
    scheme: "Authorization: Bearer <gateway_api_key> or x-api-key: <gateway_api_key>",
    note: "A API key mestra da conta enxerga apenas as instancias do proprio tenant.",
  },
  webhookEvents: [
    "connection.connected",
    "connection.connecting",
    "connection.disconnected",
    "connection.qr",
    "message.received",
    "message.sent",
    "message.server_ack",
    "message.delivered",
    "message.read",
    "message.played",
    "message.failed",
    "message.updated",
    "message.revoked",
    "presence.updated",
    "conversation.updated",
    "*",
  ],
  categories: [
    {
      id: "meta",
      title: "Meta",
      description: "Pontos de entrada e descoberta da API.",
      endpoints: [
        {
          method: "GET",
          path: "/api/integration",
          summary: "Metadados basicos da API.",
          responseExample: {
            title: "Response 200",
            value: {
              name: "AgenteZap Gateway API",
              version: "v1",
              docsPath: "/api/integration/__intro__",
              referencePath: "/api/integration/__reference__",
              authentication: {
                type: "bearer_or_x_api_key",
                header: "Authorization: Bearer <gateway_api_key> or x-api-key: <gateway_api_key>",
              },
            },
          },
        },
        {
          method: "GET",
          path: "/api/integration/__intro__",
          summary: "Resumo rapido da API, eventos de webhook e endpoints principais.",
          responseExample: {
            title: "Response 200",
            value: {
              title: "AgenteZap Gateway API Integration",
              webhookEvents: ["message.received", "message.read", "conversation.updated"],
              endpointsCount: 54,
            },
          },
        },
        {
          method: "GET",
          path: "/api/integration/__reference__",
          summary: "Catalogo completo endpoint por endpoint com exemplos de payload/resposta.",
          responseExample: {
            title: "Response 200",
            value: {
              title: "AgenteZap Gateway API Reference",
              version: "v1",
              categoriesCount: 9,
              endpointsCount: 54,
            },
          },
        },
      ],
    },
    {
      id: "instances",
      title: "Instancias",
      description: "Gerenciamento de instancias, status e lifecycle da conexao.",
      endpoints: [
        {
          method: "POST",
          path: "/api/integration/instances/status/bulk",
          summary: "Consultar status em lote de multiplas instancias.",
          requestExample: {
            title: "Request body",
            value: {
              instanceIds: [SAMPLE_INSTANCE_ID, "wa_instance_02"],
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              items: [
                {
                  instanceId: SAMPLE_INSTANCE_ID,
                  status: sampleInstanceStatus,
                  device: sampleInstanceDevice,
                },
              ],
            },
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances",
          summary: "Listar instancias da conta.",
          responseExample: {
            title: "Response 200",
            value: {
              items: [
                {
                  instanceId: SAMPLE_INSTANCE_ID,
                  connectionName: SAMPLE_CONNECTION_NAME,
                  connectionType: "baileys",
                  isPrimary: true,
                  publicApiEnabled: true,
                  publicApiTokenPreview: "inst_****************",
                  provider: "baileys",
                  providerStatus: "connected",
                  status: sampleInstanceStatus,
                  device: sampleInstanceDevice,
                },
              ],
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances",
          summary: "Criar nova instancia gerenciada.",
          requestExample: {
            title: "Request body",
            value: {
              connectionName: "Conexao Loja Centro",
              isPrimary: false,
            },
          },
          responseExample: {
            title: "Response 201",
            value: {
              success: true,
              reusedExistingConnection: false,
              instance: {
                instanceId: SAMPLE_INSTANCE_ID,
                connectionName: "Conexao Loja Centro",
                status: {
                  ...sampleInstanceStatus,
                  isConnected: false,
                  qrCode: "data:image/png;base64,...",
                  providerStatus: "connecting",
                },
                device: {
                  ...sampleInstanceDevice,
                  connectedPhone: null,
                  status: "disconnected",
                },
              },
            },
          },
        },
        {
          method: "DELETE",
          path: "/api/integration/instances/:instanceId",
          summary: "Excluir instancia secundaria.",
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID },
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/status",
          summary: "Status atual da instancia.",
          responseExample: {
            title: "Response 200",
            value: sampleInstanceStatus,
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/device",
          summary: "Metadados do device conectado.",
          responseExample: {
            title: "Response 200",
            value: sampleInstanceDevice,
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/connect",
          summary: "Iniciar conexao/pairing da instancia.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              status: {
                ...sampleInstanceStatus,
                isConnected: false,
                qrCode: "data:image/png;base64,...",
                providerStatus: "connecting",
              },
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/disconnect",
          summary: "Desconectar a instancia.",
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, disconnected: true },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/reset",
          summary: "Resetar a instancia e limpar runtime dessa conexao.",
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, reset: true },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/pairing-code",
          summary: "Gerar pairing code para login por numero.",
          requestExample: {
            title: "Request body",
            value: { phoneNumber: "5511999999999" },
          },
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, code: "ABCD-EFGH" },
          },
        },
      ],
    },
    {
      id: "conversations",
      title: "Conversas",
      description: "Consulta de chats, mensagens e midia por instancia.",
      endpoints: [
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/conversations",
          summary: "Listar conversas da instancia.",
          responseExample: {
            title: "Response 200",
            value: [
              {
                id: SAMPLE_CONVERSATION_ID,
                contactNumber: "5511999999999",
                remoteJid: "5511999999999@s.whatsapp.net",
                contactName: "Maria",
                lastMessageText: "Oi, quero saber mais",
                unreadCount: 1,
              },
            ],
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/conversations/:conversationId/messages",
          summary: "Listar mensagens da conversa.",
          responseExample: {
            title: "Response 200",
            value: [
              {
                id: "msg_local_01",
                conversationId: SAMPLE_CONVERSATION_ID,
                messageId: SAMPLE_MESSAGE_ID,
                fromMe: false,
                text: "Oi, quero saber mais",
                status: "received",
                mediaType: null,
              },
            ],
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/conversations/:conversationId/messages/:messageId/media",
          summary: "Consultar metadados da midia salva para uma mensagem.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: SAMPLE_MESSAGE_ID,
              localMessageId: "msg_local_02",
              mediaType: "image",
              mediaUrl: "https://cdn.exemplo.com/uploads/wa/123.jpg",
              mediaMimeType: "image/jpeg",
              mediaCaption: "Catalogo atualizado",
              canRedownload: true,
              redownloaded: false,
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/conversations/:conversationId/messages/:messageId/media/redownload",
          summary: "Tentar rebaixar novamente midia expirada.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: SAMPLE_MESSAGE_ID,
              redownloaded: true,
              mediaUrl: "https://cdn.exemplo.com/uploads/wa/123-refreshed.jpg",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/conversations/:conversationId/group-history-sync",
          summary: "Sincronizar historico de um grupo sob demanda.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              conversationId: SAMPLE_CONVERSATION_ID,
              status: "synced",
              importedCount: 42,
            },
          },
        },
      ],
    },
    {
      id: "contacts",
      title: "Contatos",
      description: "Validacao, foto, block/unblock e presence.",
      endpoints: [
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/contacts",
          summary: "Listar contatos sincronizados.",
          responseExample: {
            title: "Response 200",
            value: [
              {
                id: "contact_01",
                phone: "5511999999999",
                name: "Maria",
                isBlocked: false,
              },
            ],
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/contacts/validate",
          summary: "Validar se um numero tem WhatsApp.",
          queryExample: { to: "5511999999999" },
          responseExample: {
            title: "Response 200",
            value: {
              input: "5511999999999",
              exists: true,
              contactNumber: "5511999999999",
              remoteJid: "5511999999999@s.whatsapp.net",
              jidSuffix: "s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/contacts/validate-bulk",
          summary: "Validar varios numeros de uma vez.",
          requestExample: {
            title: "Request body",
            value: { contacts: ["5511999999999", "5511888888888"] },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              items: [
                {
                  input: "5511999999999",
                  exists: true,
                  contactNumber: "5511999999999",
                  remoteJid: "5511999999999@s.whatsapp.net",
                },
              ],
            },
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/contacts/profile-picture",
          summary: "Buscar foto do contato.",
          queryExample: { to: "5511999999999" },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              phoneNumber: "5511999999999",
              profilePictureUrl: "https://mmg.whatsapp.net/d/f/Abc123.jpg",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/contacts/block",
          summary: "Bloquear ou desbloquear contato.",
          requestExample: {
            title: "Request body",
            value: { to: "5511999999999", blocked: true },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              phoneNumber: "5511999999999",
              blocked: true,
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/contacts/presence",
          summary: "Enviar presence/typing para um contato.",
          requestExample: {
            title: "Request body",
            value: { to: "5511999999999", presence: "composing" },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              phoneNumber: "5511999999999",
              presence: "composing",
            },
          },
        },
      ],
    },
    {
      id: "groups",
      title: "Grupos",
      description: "Consulta e operacoes ativas de grupos.",
      endpoints: [
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/groups",
          summary: "Listar grupos.",
          responseExample: {
            title: "Response 200",
            value: [
              { id: SAMPLE_GROUP_ID, name: "Clientes VIP", participantsCount: 12 },
            ],
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/groups",
          summary: "Criar grupo.",
          requestExample: {
            title: "Request body",
            value: {
              subject: "Clientes VIP",
              participants: ["5511999999999", "5511888888888"],
            },
          },
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, groupId: SAMPLE_GROUP_ID },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/groups/join-by-invite",
          summary: "Entrar em grupo por invite code.",
          requestExample: {
            title: "Request body",
            value: { inviteCode: "J0inC0deAbC123" },
          },
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, groupId: SAMPLE_GROUP_ID },
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/groups/:groupId",
          summary: "Detalhes completos de um grupo.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              groupId: SAMPLE_GROUP_ID,
              name: "Clientes VIP",
              description: "Grupo principal de clientes",
              owner: "5511999999999@s.whatsapp.net",
              createdAt: 1713800000,
              announce: false,
              restrict: false,
              participantsCount: 12,
              admins: ["5511999999999@s.whatsapp.net"],
              participants: [
                {
                  id: "5511999999999@s.whatsapp.net",
                  phoneNumber: "5511999999999",
                  isAdmin: true,
                  isSuperAdmin: false,
                },
              ],
            },
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/groups/:groupId/participants",
          summary: "Listar participantes do grupo.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              items: [
                {
                  id: "5511999999999@s.whatsapp.net",
                  phoneNumber: "5511999999999",
                  isAdmin: true,
                  isSuperAdmin: false,
                },
              ],
            },
          },
        },
        {
          method: "PATCH",
          path: "/api/integration/instances/:instanceId/groups/:groupId/subject",
          summary: "Alterar assunto do grupo.",
          requestExample: {
            title: "Request body",
            value: { subject: "Clientes Premium" },
          },
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, groupId: SAMPLE_GROUP_ID, subject: "Clientes Premium" },
          },
        },
        {
          method: "PATCH",
          path: "/api/integration/instances/:instanceId/groups/:groupId/description",
          summary: "Alterar descricao do grupo.",
          requestExample: {
            title: "Request body",
            value: { description: "Somente avisos oficiais" },
          },
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, groupId: SAMPLE_GROUP_ID, description: "Somente avisos oficiais" },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/groups/:groupId/participants",
          summary: "Adicionar/remover/promover/demover participantes.",
          requestExample: {
            title: "Request body",
            value: {
              action: "add",
              participants: ["5511777777777", "5511666666666"],
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              groupId: SAMPLE_GROUP_ID,
              action: "add",
              items: [
                { jid: "5511777777777@s.whatsapp.net", status: "200" },
              ],
            },
          },
        },
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/groups/:groupId/invite-code",
          summary: "Consultar invite code do grupo.",
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, groupId: SAMPLE_GROUP_ID, inviteCode: "J0inC0deAbC123" },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/groups/:groupId/invite-code/revoke",
          summary: "Revogar invite code do grupo.",
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, groupId: SAMPLE_GROUP_ID, inviteCode: "N3wInv1t3C0de" },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/groups/:groupId/leave",
          summary: "Sair do grupo.",
          responseExample: {
            title: "Response 200",
            value: { success: true, instanceId: SAMPLE_INSTANCE_ID, groupId: SAMPLE_GROUP_ID, left: true },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/groups/send-bulk",
          summary: "Enviar texto em massa para grupos.",
          requestExample: {
            title: "Request body",
            value: {
              groupIds: [SAMPLE_GROUP_ID],
              message: "Aviso geral para o grupo.",
              settings: { delayMin: 5, delayMax: 15, useAI: false },
            },
          },
          responseExample: {
            title: "Response 200",
            value: { sent: 1, failed: 0, errors: [] },
          },
        },
      ],
    },
    {
      id: "queue",
      title: "Fila",
      description: "Diagnostico e limpeza da fila anti-ban do runtime.",
      endpoints: [
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/queue",
          summary: "Consultar fila anti-ban da instancia.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              scope: "account_runtime_shared",
              queueLength: 2,
              isProcessing: true,
              totalSent: 120,
              totalErrors: 1,
              lastSentAt: "2026-04-24T12:30:00.000Z",
              batchCount: 3,
              isPaused: false,
              pauseRemainingMs: 0,
              minuteCount: 4,
              hourCount: 38,
              dayCount: 112,
              batchPauseLevel: 0,
              currentPauseDurationMs: 0,
              canSendNow: true,
              waitMs: 0,
              reason: null,
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/queue/clear",
          summary: "Limpar itens pendentes da fila.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              cleared: 2,
              wasPending: true,
              queueLength: 0,
            },
          },
        },
      ],
    },
    {
      id: "webhooks",
      title: "Webhooks",
      description: "Cadastro e gerenciamento de webhooks por instancia.",
      endpoints: [
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/webhooks",
          summary: "Listar webhooks cadastrados.",
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              items: [
                {
                  id: SAMPLE_WEBHOOK_ID,
                  url: "https://example.com/webhooks/agentezap",
                  enabled: true,
                  events: ["message.received", "message.read"],
                  secretPreview: "whsec_********",
                },
              ],
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/webhooks",
          summary: "Criar webhook.",
          requestExample: {
            title: "Request body",
            value: {
              url: "https://example.com/webhooks/agentezap",
              enabled: true,
              events: ["message.received", "message.read"],
              secret: "whsec_test_123",
            },
          },
          responseExample: {
            title: "Response 201",
            value: {
              success: true,
              webhook: {
                id: SAMPLE_WEBHOOK_ID,
                url: "https://example.com/webhooks/agentezap",
                enabled: true,
                events: ["message.received", "message.read"],
              },
            },
          },
        },
        {
          method: "PATCH",
          path: "/api/integration/instances/:instanceId/webhooks/:webhookId",
          summary: "Atualizar webhook.",
          requestExample: {
            title: "Request body",
            value: { enabled: false, events: ["message.received"] },
          },
          responseExample: {
            title: "Response 200",
            value: { success: true, webhook: { id: SAMPLE_WEBHOOK_ID, enabled: false } },
          },
        },
        {
          method: "DELETE",
          path: "/api/integration/instances/:instanceId/webhooks/:webhookId",
          summary: "Remover webhook.",
          responseExample: {
            title: "Response 200",
            value: { success: true, webhookId: SAMPLE_WEBHOOK_ID },
          },
        },
      ],
    },
    {
      id: "status-posts",
      title: "Status Posts",
      description: "Previa de audiencia e envio de status/story.",
      endpoints: [
        {
          method: "GET",
          path: "/api/integration/instances/:instanceId/status-posts/preview-audience",
          summary: "Consultar alcance atual dos status.",
          responseExample: {
            title: "Response 200",
            value: {
              audienceCount: 138,
              connectionId: SAMPLE_INSTANCE_ID,
              isConnected: true,
              audienceSource: "contacts",
              statusPrivacy: "all",
              statusPrivacyLabel: "Todos os contatos",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/status-posts/send",
          summary: "Publicar status/story.",
          requestExample: {
            title: "Request body",
            value: {
              type: "text",
              text: "Novidade da semana",
              backgroundColor: "#0ea5e9",
              textColor: "#ffffff",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              connectionId: SAMPLE_INSTANCE_ID,
              audienceCount: 138,
              sentMessageIds: ["BAE5F1C2D3E4"],
            },
          },
        },
      ],
    },
    {
      id: "messages",
      title: "Mensagens",
      description: "Primitives publicas de envio WhatsApp do gateway.",
      endpoints: [
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/text",
          aliases: ["/api/integration/instances/:instanceId/messages/send"],
          summary: "Enviar texto.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              text: "Oi, tudo bem?",
              isFromAgent: false,
              source: "owner",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              messageId: "BAE5F1C2D3E4",
              conversationId: SAMPLE_CONVERSATION_ID,
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/media",
          aliases: ["/api/integration/instances/:instanceId/messages/send-media"],
          summary: "Enviar midia.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              type: "image",
              data: "data:image/jpeg;base64,...",
              mimetype: "image/jpeg",
              caption: "Catalogo atualizado",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3E5",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/image",
          aliases: ["/api/integration/instances/:instanceId/messages/send-image"],
          summary: "Enviar imagem.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              data: "data:image/jpeg;base64,...",
              mimetype: "image/jpeg",
              caption: "Foto do produto",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3EA",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/audio",
          aliases: ["/api/integration/instances/:instanceId/messages/send-audio"],
          summary: "Enviar audio ou PTT.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              data: "data:audio/ogg;base64,...",
              mimetype: "audio/ogg; codecs=opus",
              ptt: true,
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3EB",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/video",
          aliases: ["/api/integration/instances/:instanceId/messages/send-video"],
          summary: "Enviar video.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              data: "data:video/mp4;base64,...",
              mimetype: "video/mp4",
              caption: "Demonstracao do produto",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3EC",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/document",
          aliases: ["/api/integration/instances/:instanceId/messages/send-document"],
          summary: "Enviar documento.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              data: "data:application/pdf;base64,...",
              mimetype: "application/pdf",
              filename: "catalogo.pdf",
              caption: "Tabela de precos",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3ED",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/contact",
          aliases: ["/api/integration/instances/:instanceId/messages/send-contact"],
          summary: "Enviar contato/vCard.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              phoneNumber: "5511999999999",
              displayName: "Maria Silva",
              organization: "AgenteZap",
              email: "maria@example.com",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3E6",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/location",
          aliases: ["/api/integration/instances/:instanceId/messages/send-location"],
          summary: "Enviar localizacao.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              latitude: -23.55052,
              longitude: -46.633308,
              name: "Loja Centro",
              address: "Av. Paulista, 1000",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3E7",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/buttons",
          aliases: ["/api/integration/instances/:instanceId/messages/send-buttons"],
          summary: "Enviar menu de botoes.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              body: "Escolha uma opcao:",
              buttons: [
                { id: "catalogo", title: "Ver catalogo" },
                { id: "atendente", title: "Falar com atendente" },
              ],
              footer: { text: "Digite o numero ou toque na opcao" },
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3E8",
              remoteJid: "5511999999999@s.whatsapp.net",
              error: null,
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/list",
          aliases: ["/api/integration/instances/:instanceId/messages/send-list"],
          summary: "Enviar lista/menu.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              body: "Selecione o produto:",
              buttonText: "Ver opcoes",
              sections: [
                {
                  title: "Produtos",
                  rows: [
                    { id: "produto_1", title: "Plano Start", description: "A partir de R$49,99" },
                    { id: "produto_2", title: "Plano Pro", description: "Mais recursos" },
                  ],
                },
              ],
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: "BAE5F1C2D3E9",
              remoteJid: "5511999999999@s.whatsapp.net",
              error: null,
            },
          },
        },
        {
          method: "POST",
          path: "/api/integration/instances/:instanceId/messages/reaction",
          aliases: ["/api/integration/instances/:instanceId/messages/send-reaction"],
          summary: "Reagir a uma mensagem existente.",
          requestExample: {
            title: "Request body",
            value: {
              conversationId: SAMPLE_CONVERSATION_ID,
              messageId: SAMPLE_MESSAGE_ID,
              emoji: "👍",
            },
          },
          responseExample: {
            title: "Response 200",
            value: {
              success: true,
              instanceId: SAMPLE_INSTANCE_ID,
              conversationId: SAMPLE_CONVERSATION_ID,
              targetMessageId: SAMPLE_MESSAGE_ID,
              messageId: "BAE5F1C2D3F0",
              remoteJid: "5511999999999@s.whatsapp.net",
            },
          },
        },
      ],
    },
  ] satisfies GatewayApiCategoryReference[],
} as const;
