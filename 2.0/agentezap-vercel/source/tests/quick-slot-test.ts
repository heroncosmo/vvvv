/**
 * Teste rápido para validar a lógica de geração de slots
 * Reproduz exatamente o cenário do usuário: 18:37, pedindo 19:00
 */

// Simular timezone de São Paulo
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

interface SlotResult {
  start: string;
  end: string;
  available: boolean;
  reason?: string;
}

function generateSlotsWithReasons(
  config: {
    workStartTime: string;
    workEndTime: string;
    slotDuration: number;
    bufferBetween: number;
    minNoticeHours: number;
    hasBreak: boolean;
    breakStart: string;
    breakEnd: string;
  },
  currentTime: string,
  existingAppointments: { start: string; end: string }[] = []
): SlotResult[] {
  const slots: SlotResult[] = [];
  
  const startMinutes = timeToMinutes(config.workStartTime);
  let endMinutes = timeToMinutes(config.workEndTime);
  if (endMinutes === 0 || endMinutes <= startMinutes) {
    endMinutes = 24 * 60; // Meia-noite
  }
  
  // Pausa
  let breakStartMinutes = 0;
  let breakEndMinutes = 0;
  if (config.hasBreak) {
    breakStartMinutes = timeToMinutes(config.breakStart);
    breakEndMinutes = timeToMinutes(config.breakEnd);
  }
  
  // Antecedência mínima
  const currentMinutes = timeToMinutes(currentTime);
  const minSlotMinutes = currentMinutes + (config.minNoticeHours * 60);
  
  console.log(`\n📊 PARÂMETROS:`);
  console.log(`   Horário atual: ${currentTime} (${currentMinutes} minutos)`);
  console.log(`   Antecedência mínima: ${config.minNoticeHours}h`);
  console.log(`   Horário mínimo para agendar: ${minutesToTime(minSlotMinutes)} (${minSlotMinutes} minutos)`);
  console.log(`   Expediente: ${config.workStartTime} - ${config.workEndTime} (${startMinutes}-${endMinutes} minutos)`);
  if (config.hasBreak) {
    console.log(`   Pausa: ${config.breakStart} - ${config.breakEnd}`);
  }
  console.log('');
  
  // Gerar slots
  let slotMinutes = startMinutes;
  
  while (slotMinutes + config.slotDuration <= endMinutes) {
    const slotEndMinutes = slotMinutes + config.slotDuration;
    
    // Verificar pausa
    const isInBreak = config.hasBreak && 
      slotMinutes < breakEndMinutes && 
      slotEndMinutes > breakStartMinutes;
    
    // Verificar antecedência
    const respectsMinNotice = slotMinutes >= minSlotMinutes;
    
    // Verificar conflitos
    const hasConflict = existingAppointments.some(apt => {
      const aptStart = timeToMinutes(apt.start);
      const aptEnd = timeToMinutes(apt.end);
      return slotMinutes < aptEnd && slotEndMinutes > aptStart;
    });
    
    let reason = '';
    if (!respectsMinNotice) {
      reason = `bloqueado por antecedência (${slotMinutes} < ${minSlotMinutes})`;
    } else if (isInBreak) {
      reason = 'dentro do horário de pausa';
    } else if (hasConflict) {
      reason = 'conflito com agendamento existente';
    }
    
    slots.push({
      start: minutesToTime(slotMinutes),
      end: minutesToTime(slotEndMinutes),
      available: !isInBreak && !hasConflict && respectsMinNotice,
      reason
    });
    
    slotMinutes += config.slotDuration + config.bufferBetween;
  }
  
  return slots;
}

// =====================
// TESTE PRINCIPAL
// =====================

console.log('=' .repeat(60));
console.log('TESTE: Cenário do Usuário - 18:37 pedindo 19:00');
console.log('=' .repeat(60));

const config = {
  workStartTime: '09:00',
  workEndTime: '00:00', // Meia-noite
  slotDuration: 60,
  bufferBetween: 15,
  minNoticeHours: 2,
  hasBreak: true,
  breakStart: '12:00',
  breakEnd: '13:00'
};

const currentTime = '18:37';

const slots = generateSlotsWithReasons(config, currentTime);

console.log('📋 TODOS OS SLOTS GERADOS:');
console.log('-'.repeat(60));

for (const slot of slots) {
  const status = slot.available ? '✅ DISPONÍVEL' : '❌ BLOQUEADO';
  const reasonText = slot.reason ? ` (${slot.reason})` : '';
  console.log(`   ${slot.start}-${slot.end} ${status}${reasonText}`);
}

console.log('\n');
console.log('📊 RESUMO:');
console.log('-'.repeat(60));

const available = slots.filter(s => s.available);
const blocked = slots.filter(s => !s.available);

console.log(`   Total de slots: ${slots.length}`);
console.log(`   Disponíveis: ${available.length}`);
console.log(`   Bloqueados: ${blocked.length}`);
console.log('');

if (available.length > 0) {
  console.log(`   ✅ Horários disponíveis: ${available.map(s => s.start).join(', ')}`);
}

// Verificar o slot das 19:00
const slot19 = slots.find(s => s.start === '19:00');
if (slot19) {
  console.log('');
  console.log('🔍 ANÁLISE DO SLOT 19:00:');
  console.log(`   Status: ${slot19.available ? 'DISPONÍVEL' : 'BLOQUEADO'}`);
  if (slot19.reason) {
    console.log(`   Motivo: ${slot19.reason}`);
  }
}

console.log('');
console.log('=' .repeat(60));
console.log('CONCLUSÃO:');
console.log('=' .repeat(60));
console.log(`
O slot de 19:00 está CORRETAMENTE bloqueado porque:
- Hora atual: ${currentTime}
- Antecedência mínima: ${config.minNoticeHours}h
- Horário mínimo para agendar: ${minutesToTime(timeToMinutes(currentTime) + config.minNoticeHours * 60)}
- 19:00 (1140 min) < 20:37 (1237 min) → BLOQUEADO

A IA deveria responder algo como:
"Para hoje precisamos de 2h de antecedência. O próximo horário disponível é ${available[0]?.start || 'amanhã'}."
`);
