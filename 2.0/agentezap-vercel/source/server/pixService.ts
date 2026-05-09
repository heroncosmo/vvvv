import QRCode from 'qrcode';
import { storage } from './storage';

interface PixPaymentData {
  planNome: string;
  valor: number;
  subscriptionId: string;
  pixKeyOverride?: string;
}

export async function generatePixQRCode(paymentData: PixPaymentData) {
  try {
    const pixKeyConfig = await storage.getSystemConfig('pix_key');
    const merchantNameConfig = await storage.getSystemConfig('merchant_name');
    const merchantCityConfig = await storage.getSystemConfig('merchant_city');
    
    const pixKeyRaw = paymentData.pixKeyOverride || pixKeyConfig?.valor || 'rodrigoconexao128@gmail.com';
    const merchantNameRaw = merchantNameConfig?.valor || 'RODRIGO MACEDO';
    const merchantCityRaw = merchantCityConfig?.valor || 'COSMORAMA';

    // Formata a chave PIX seguindo o padrão EMV BR Code
    // Se for telefone (apenas dígitos), formata como +55XXXXXXXXXXX
    let pixKey = String(pixKeyRaw).replace(/\s+/g, '').trim();

    // Seguindo exatamente o padrão Piggly parsePhone():
    // 1. Remove +55 se existir
    // 2. Remove caracteres não numéricos  
    // 3. Se começa com 55 (DDI), remove o 55
    // 4. Adiciona +55 no início
    
    const cleanKey = pixKey.replace(/\+55/g, ''); // Remove +55 se existir
    let onlyDigits = cleanKey.replace(/\D/g, ''); // Apenas dígitos
    
    // Se for telefone (10-13 dígitos), formata corretamente
    if (onlyDigits.length >= 10 && onlyDigits.length <= 13) {
      // Se começa com 55 (DDI Brasil já incluído), remove para não duplicar
      if (onlyDigits.length >= 12 && onlyDigits.startsWith('55')) {
        onlyDigits = onlyDigits.substring(2); // Remove o 55 do início
      }
      // Agora adiciona +55 (resultado: +55 + DDD + número)
      pixKey = '+55' + onlyDigits;
    }

    // TXID: alfanumérico, máx. 25 caracteres
    const baseId = String(paymentData.subscriptionId || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const randomSuffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const txid = (baseId + randomSuffix).substring(0, 25) || 'TX' + Date.now().toString().substring(0, 23);

    // Valor com 2 casas
    const valorNum = typeof (paymentData as any).valor === 'string'
      ? parseFloat(String((paymentData as any).valor).replace(',', '.'))
      : Number(paymentData.valor || 0);
    const valor = Number.isFinite(valorNum) && valorNum > 0 ? Number(valorNum.toFixed(2)) : 0.01;

    // Sanitização: remove acentos, caracteres especiais e converte para maiúsculas
    // Segue o padrão do plugin de referência (Cast::cleanStr + Cast::upperStr)
    const sanitize = (s: string, max: number) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^A-Za-z0-9 ]/g, '')   // Mantém apenas A-Z, a-z, 0-9 e espaço (SEM hífen)
        .replace(/\s+/g, ' ')            // Normaliza espaços múltiplos
        .trim()
        .toUpperCase()                   // Converte para maiúsculas
        .slice(0, max);                  // Limita ao tamanho máximo

    const name = sanitize(merchantNameRaw, 25);
    const city = sanitize(merchantCityRaw, 15);
    const message = sanitize(`Pagamento ${paymentData.planNome || ''}`, 50);

    // TLV helpers
    const tlv = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;

    // Merchant Account Information (campo 26)
    // Seguindo o padrão do plugin de referência: APENAS GUI (00) e PIX Key (01)
    // NÃO incluir Description (02) para manter compatibilidade com bancos
    const maids = tlv('00', 'br.gov.bcb.pix') + tlv('01', pixKey);
    const merchantAccountInfo = tlv('26', maids);

    const amount = valor.toFixed(2);
    const base = ''
      + tlv('00', '01')         // Payload Format Indicator
      + tlv('01', '11')         // Point of Initiation Method (11 = dinâmico, 12 = estático)
      + merchantAccountInfo
      + tlv('52', '0000')       // Merchant Category Code
      + tlv('53', '986')        // Transaction Currency (986 = BRL)
      + tlv('54', amount)       // Transaction Amount
      + tlv('58', 'BR')         // Country Code
      + tlv('59', name)         // Merchant Name
      + tlv('60', city)         // Merchant City
      + tlv('62', tlv('05', txid)); // Additional Data Field Template -> Reference Label

    // CRC16-CCITT (0xFFFF, 0x1021)
    const crcInput = base + '6304';
    let crc = 0xFFFF;
    for (let i = 0; i < crcInput.length; i++) {
      crc ^= crcInput.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
    const payload = crcInput + crcHex;

    // Log para debug do PIX
    console.log('[PIX Generation]', {
      pixKeyRaw,
      pixKeyFormatted: pixKey,
      amount: valor,
      txid,
      payload: payload.substring(0, 100) + '...'
    });

    // Gera imagem do QR
    const pixQrCode = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', type: 'image/png', margin: 1, width: 300 });

    return { pixCode: payload, pixQrCode };
  } catch (error) {
    console.error('Error generating PIX QR Code:', error);
    throw error;
  }
}





