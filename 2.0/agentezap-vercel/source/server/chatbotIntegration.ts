/**
 * Integração do Chatbot de Fluxo com o WhatsApp
 * 
 * Este módulo gerencia a integração entre o chatbot de fluxo predefinido
 * e o sistema de mensagens do WhatsApp.
 */

import { processChatbotMessage, isChatbotActive, clearFlowCache } from "./chatbotFlowEngine";
import { sendWhatsAppMessageFromUser, sendWhatsAppButtonsFromUser, sendWhatsAppListFromUser, sendWhatsAppMediaFromUser } from "./whatsappSender";
import { storage } from "./storage";
import { supabase } from "./supabaseAuth";

interface ChatbotMessageResult {
  handled: boolean;
  transferToHuman?: boolean;
}

function inferFlowMediaMimeType(mediaType: string, mediaUrl: string): string {
  if (mediaType === 'image') {
    if (mediaUrl.match(/\.png$/i)) return 'image/png';
    if (mediaUrl.match(/\.gif$/i)) return 'image/gif';
    if (mediaUrl.match(/\.webp$/i)) return 'image/webp';
    return 'image/jpeg';
  }

  if (mediaType === 'video') {
    if (mediaUrl.match(/\.webm$/i)) return 'video/webm';
    return 'video/mp4';
  }

  if (mediaType === 'audio') {
    if (mediaUrl.match(/\.(ogg|opus)$/i)) return 'audio/ogg; codecs=opus';
    if (mediaUrl.match(/\.wav$/i)) return 'audio/wav';
    if (mediaUrl.match(/\.m4a$/i)) return 'audio/mp4';
    if (mediaUrl.match(/\.webm$/i)) return 'audio/webm';
    return 'audio/mpeg';
  }

  if (mediaUrl.match(/\.pdf$/i)) return 'application/pdf';
  return 'application/octet-stream';
}

/**
 * Tenta processar uma mensagem usando o chatbot de fluxo.
 * Se o chatbot não estiver ativo ou não processar a mensagem, retorna handled=false
 * para que o sistema de IA possa processar.
 * 
 * @param userId - ID do usuário dono do chatbot
 * @param conversationId - ID da conversa
 * @param contactNumber - Número do contato
 * @param messageText - Texto da mensagem recebida
 * @param isFirstContact - Se é o primeiro contato com este número
 * @returns Resultado indicando se o chatbot processou a mensagem
 */
export async function tryProcessChatbotMessage(
  userId: string,
  conversationId: string,
  contactNumber: string,
  messageText: string,
  isFirstContact: boolean = false
): Promise<ChatbotMessageResult> {
  try {
    // 🔀 PARTE 5 CORREÇÃO: Se Modo Fluxo (flowModeActive) está ativo,
    // o FlowScriptEngine tem PRIORIDADE MÁXIMA sobre o Visual Flow Builder.
    // Retornar handled=false para que a IA em generateAIResponse use o roteiro de fluxo.
    const agentConfig = await storage.getAgentConfig(userId);
    if ((agentConfig as any)?.flowModeActive === true && (agentConfig as any)?.flowScript?.trim().length > 10) {
      console.log(`🔀 [CHATBOT_INTEGRATION] Modo Fluxo ativo para ${userId} — delegando para FlowScriptEngine (prioridade)`);
      return { handled: false };
    }

    // Verificar se o chatbot está ativo para este usuário
    const chatbotActive = await isChatbotActive(userId);
    
    if (!chatbotActive) {
      console.log(`🤖 [CHATBOT] Chatbot não ativo para usuário ${userId}, delegando para IA`);
      return { handled: false };
    }

    console.log(`🤖 [CHATBOT] Processando mensagem para ${contactNumber} (conversa: ${conversationId})`);

    // Processar mensagem pelo chatbot
    const response = await processChatbotMessage(
      userId,
      conversationId,
      contactNumber,
      messageText,
      isFirstContact
    );

    if (!response || response.messages.length === 0) {
      console.log(`🤖 [CHATBOT] Chatbot não gerou resposta, delegando para IA`);
      return { handled: false };
    }

    // Enviar as mensagens
    for (let i = 0; i < response.messages.length; i++) {
      const msg = response.messages[i];
      
      // Aplicar delay se especificado
      if (msg.delay && i > 0) {
        await new Promise(resolve => setTimeout(resolve, msg.delay));
      }

      try {
        let sent = false;
        switch (msg.type) {
          case 'text':
            sent = await sendWhatsAppMessageFromUser(userId, contactNumber, msg.content, 'chatbot_flow', { conversationId });
            break;

          case 'buttons':
            // Enviar mensagem interativa com botões
            const buttonPayload = {
              body: msg.content.body,
              buttons: msg.content.buttons.map((btn: any) => ({
                type: 'reply' as const,
                reply: {
                  id: btn.id,
                  title: btn.title.substring(0, 20) // WhatsApp limita a 20 caracteres
                }
              }))
            };
            
            if (msg.content.header) {
              (buttonPayload as any).header = { type: 'text', text: msg.content.header };
            }
            if (msg.content.footer) {
              (buttonPayload as any).footer = { text: msg.content.footer };
            }
            
            sent = await sendWhatsAppButtonsFromUser(userId, contactNumber, buttonPayload, 'chatbot_flow', { conversationId });
            break;

          case 'list':
            // Enviar lista interativa
            const listPayload = {
              body: msg.content.body,
              buttonText: msg.content.button_text || 'Ver opções',
              sections: msg.content.sections.map((section: any) => ({
                title: section.title || 'Opções',
                rows: section.rows.map((row: any) => ({
                  id: row.id,
                  title: row.title.substring(0, 24), // WhatsApp limita a 24 caracteres
                  description: row.description?.substring(0, 72) // WhatsApp limita a 72 caracteres
                }))
              }))
            };
            
            if (msg.content.header) {
              (listPayload as any).header = { type: 'text', text: msg.content.header };
            }
            if (msg.content.footer) {
              (listPayload as any).footer = { text: msg.content.footer };
            }
            
            sent = await sendWhatsAppListFromUser(userId, contactNumber, listPayload, 'chatbot_flow', { conversationId });
            break;

          case 'media':
            // Enviar mídia real via WhatsApp (imagem, áudio, vídeo ou documento)
            const mediaUrl = msg.content.url;
            const mediaCaption = msg.content.caption || '';
            const mimeType = inferFlowMediaMimeType(msg.content.media_type, mediaUrl);
            
            console.log(`📤 [CHATBOT] Enviando mídia ${msg.content.media_type}: ${mediaUrl}`);
            
            sent = await sendWhatsAppMediaFromUser(
              userId, 
              contactNumber, 
              mediaUrl,
              mediaCaption,
              mimeType,
              'chatbot_flow',
              { conversationId }
            );
            break;
        }

        // Salvar mensagem no histórico
        if (!sent) {
          console.log(`⏸️ [CHATBOT] Envio bloqueado ou falhou para conversa ${conversationId}; interrompendo sequência automática`);
          break;
        }

        const messageId = `chatbot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await storage.createMessage({
          conversationId,
          messageId,
          text: typeof msg.content === 'string' ? msg.content : msg.content.body || JSON.stringify(msg.content),
          fromMe: true,
          isFromAgent: true,
          timestamp: new Date()
        });

      } catch (sendError) {
        console.error(`🤖 [CHATBOT] Erro ao enviar mensagem:`, sendError);
      }
    }

    // Se deve transferir para humano, desativar IA para esta conversa
    if (response.shouldTransferToHuman) {
      console.log(`🤖 [CHATBOT] Transferindo conversa ${conversationId} para humano`);
      await storage.disableAgentForConversation(conversationId);
    }

    // ============================================================
    // 🍕 PROCESSAR PEDIDO DE DELIVERY SE HOUVER
    // ============================================================
    if (response.variables?.__delivery_order_pending === 'true' && response.variables?.__delivery_order_data) {
      try {
        const orderData = JSON.parse(response.variables.__delivery_order_data);
        console.log(`🍕 [CHATBOT] Salvando pedido de delivery na tabela delivery_pedidos`);
        
        // Buscar nome do contato
        const conversation = await storage.getConversation(conversationId);
        const contactName = conversation?.contactName || 'Cliente';
        
        // Salvar na tabela delivery_pedidos
        const { data: savedOrder, error: saveError } = await supabase
          .from('delivery_pedidos')
          .insert({
            user_id: userId,
            conversation_id: conversationId,
            contact_number: contactNumber,
            contact_name: contactName,
            status: 'pendente',
            items: orderData.items || [],
            subtotal: orderData.subtotal || 0,
            delivery_fee: orderData.delivery_fee || 0,
            discount: orderData.discount || 0,
            total: orderData.total || 0,
            delivery_type: orderData.delivery_type || 'delivery',
            delivery_address: orderData.delivery_address || null,
            payment_method: orderData.payment_method || 'dinheiro',
            payment_status: 'pendente',
            notes: orderData.notes || null
          })
          .select()
          .single();

        if (saveError) {
          console.error(`🍕 [CHATBOT] Erro ao salvar pedido:`, saveError);
        } else {
          console.log(`🍕 [CHATBOT] Pedido #${savedOrder?.id} salvo com sucesso na tabela delivery_pedidos`);
        }
      } catch (deliveryError) {
        console.error(`🍕 [CHATBOT] Erro ao processar pedido de delivery:`, deliveryError);
      }
    }

    // ============================================================
    // 🍕 SALVAMENTO AUTOMÁTICO - Detectar pedidos de pizza pelo fluxo
    // Quando o fluxo termina com variáveis de pizza, salvar automaticamente
    // ============================================================
    const hasPizzaVariables = response.variables?.sabor_pizza && response.variables?.pagamento;
    const hasConfirmationMessage = response.messages?.some((msg: any) => 
      typeof msg.content === 'string' && msg.content.includes('PEDIDO CONFIRMADO')
    );
    const notAlreadySaved = response.variables?.__delivery_order_pending !== 'true';

    if (hasPizzaVariables && hasConfirmationMessage && notAlreadySaved) {
      try {
        console.log(`🍕 [CHATBOT] Auto-detectado pedido de pizza/delivery - salvando automaticamente`);
        
        // Buscar nome do contato
        const conversation = await storage.getConversation(conversationId);
        const contactName = response.variables?.nome_cliente || conversation?.contactName || 'Cliente';
        
        // Montar descrição do item baseado nas variáveis
        const sabor = response.variables?.sabor_pizza || '';
        const tamanho = response.variables?.tamanho || '';
        const borda = response.variables?.borda || '';
        const tipoEntrega = response.variables?.tipo_entrega || 'delivery';
        const endereco = response.variables?.endereco || '';
        const pagamento = response.variables?.pagamento || 'dinheiro';
        const troco = response.variables?.troco || '';
        
        // Determinar tipo de entrega
        const isDelivery = tipoEntrega.toLowerCase().includes('delivery');
        
        // Calcular taxa de entrega (R$8 para delivery)
        const deliveryFee = isDelivery ? 8 : 0;
        
        // Estimar preço baseado no tamanho (valores aproximados)
        let basePrice = 0;
        if (tamanho.includes('P') || tamanho.includes('Pequena')) basePrice = 35;
        else if (tamanho.includes('M') || tamanho.includes('Média')) basePrice = 45;
        else if (tamanho.includes('G') || tamanho.includes('Grande')) basePrice = 55;
        else basePrice = 45; // default médio
        
        // Adicionar preço da borda se tiver
        const bordaPrice = borda && !borda.toLowerCase().includes('não') ? 10 : 0;
        
        const subtotal = basePrice + bordaPrice;
        const total = subtotal + deliveryFee;
        
        // Criar item do pedido
        const orderItem = {
          name: `Pizza ${sabor} (${tamanho})`,
          quantity: 1,
          price: basePrice,
          extras: borda && !borda.toLowerCase().includes('não') ? [{ name: `Borda ${borda}`, price: bordaPrice }] : [],
          notes: ''
        };
        
        // Salvar na tabela delivery_pedidos
        const { data: savedOrder, error: saveError } = await supabase
          .from('delivery_pedidos')
          .insert({
            user_id: userId,
            conversation_id: conversationId,
            contact_number: contactNumber,
            contact_name: contactName,
            status: 'pendente',
            items: [orderItem],
            subtotal: subtotal,
            delivery_fee: deliveryFee,
            discount: 0,
            total: total,
            delivery_type: isDelivery ? 'delivery' : 'pickup',
            delivery_address: endereco ? { street: endereco } : null,
            payment_method: pagamento.toLowerCase().includes('pix') ? 'pix' : 
                           pagamento.toLowerCase().includes('cartão') || pagamento.toLowerCase().includes('cartao') ? 'cartao' : 'dinheiro',
            payment_status: 'pendente',
            notes: troco && troco !== '0' ? `Troco para R$ ${troco}` : null
          })
          .select()
          .single();

        if (saveError) {
          console.error(`🍕 [CHATBOT] Erro ao salvar pedido de pizza:`, saveError);
        } else {
          console.log(`🍕 [CHATBOT] Pedido de pizza #${savedOrder?.id} salvo com sucesso na tabela delivery_pedidos`);
          console.log(`   📋 Item: ${orderItem.name}`);
          console.log(`   💰 Total: R$ ${total} (subtotal: ${subtotal} + entrega: ${deliveryFee})`);
          console.log(`   📍 Tipo: ${isDelivery ? 'Delivery' : 'Retirada'}`);
          console.log(`   💳 Pagamento: ${pagamento}`);
        }
      } catch (autoSaveError) {
        console.error(`🍕 [CHATBOT] Erro ao salvar pedido de pizza automaticamente:`, autoSaveError);
      }
    }

    // ============================================================
    // 📅 PROCESSAR AGENDAMENTO SE HOUVER
    // ============================================================
    if (response.variables?.__appointment_pending === 'true' && response.variables?.__appointment_data) {
      try {
        const appointmentData = JSON.parse(response.variables.__appointment_data);
        console.log(`📅 [CHATBOT] Salvando agendamento na tabela appointments`);
        
        // Buscar nome do contato
        const conversation = await storage.getConversation(conversationId);
        const clientName = appointmentData.client_name || conversation?.contactName || 'Cliente';
        
        // Calcular end_time baseado em duration_minutes
        const durationMinutes = appointmentData.duration_minutes || 60;
        const startTime = appointmentData.start_time || '09:00';
        const [hours, minutes] = startTime.split(':').map(Number);
        const endDate = new Date(2000, 0, 1, hours, minutes + durationMinutes);
        const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
        
        // Gerar ID único para o agendamento
        const appointmentId = `apt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Salvar na tabela appointments
        const { data: savedAppointment, error: saveError } = await supabase
          .from('appointments')
          .insert({
            id: appointmentId,
            user_id: userId,
            conversation_id: conversationId,
            client_name: clientName,
            client_phone: contactNumber,
            client_email: appointmentData.client_email || null,
            service_id: appointmentData.service_id || null,
            service_name: appointmentData.service_name || 'Serviço não especificado',
            professional_id: appointmentData.professional_id || null,
            professional_name: appointmentData.professional_name || null,
            appointment_date: appointmentData.appointment_date,
            start_time: startTime,
            end_time: endTime,
            duration_minutes: durationMinutes,
            location: appointmentData.location || null,
            location_type: appointmentData.location_type || 'presencial',
            status: 'pendente',
            confirmed_by_client: false,
            confirmed_by_business: false,
            created_by_ai: true,
            ai_confirmation_pending: true,
            client_notes: appointmentData.notes || null,
            ai_conversation_context: {
              conversationId,
              createdAt: new Date().toISOString(),
              variables: response.variables
            }
          })
          .select()
          .single();

        if (saveError) {
          console.error(`📅 [CHATBOT] Erro ao salvar agendamento:`, saveError);
        } else {
          console.log(`📅 [CHATBOT] Agendamento ${savedAppointment?.id} salvo com sucesso na tabela appointments`);
        }
      } catch (appointmentError) {
        console.error(`📅 [CHATBOT] Erro ao processar agendamento:`, appointmentError);
      }
    }

    return {
      handled: true,
      transferToHuman: response.shouldTransferToHuman
    };

  } catch (error) {
    console.error(`🤖 [CHATBOT] Erro ao processar mensagem:`, error);
    return { handled: false };
  }
}

/**
 * Verificar se é um novo contato (primeira mensagem desta conversa)
 */
export async function isNewContact(conversationId: string): Promise<boolean> {
  try {
    const messages = await storage.getMessagesByConversationId(conversationId);
    // É novo se tem 1 ou menos mensagens (a que acabou de chegar)
    return messages.length <= 1;
  } catch (error) {
    console.error(`[CHATBOT] Erro ao verificar se é novo contato:`, error);
    return false;
  }
}

/**
 * Limpar cache do fluxo quando o usuário salva alterações
 */
export { clearFlowCache };
