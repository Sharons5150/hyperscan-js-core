/**
 * interrupt.js - Interrupt Controller (INTC) - CORRIGIDO
 * Implementação fiel do controlador de interrupções do HyperScan (SPG290/SPCE3200).
 * 
 * ✅ CORRIGIDO: Extends MemoryRegion
 * ✅ CORRIGIDO: Métodos readU8/readU16 adicionados
 * ✅ CORRIGIDO: Compatibilidade total com MIU e IOMemoryRegion
 * 
 * Responsabilidade:
 * 1. Receber sinais de periféricos (VDU, UART, Timers).
 * 2. Verificar se a interrupção está mascarada (habilitada/desabilitada).
 * 3. Disparar a exceção na CPU para desviar o fluxo de execução.
 */

"use strict";

if (typeof InterruptController === 'undefined') {
    /**
     * Controlador de Interrupções
     * ✅ CORRIGIDO: Extends MemoryRegion para compatibilidade com MIU
     * 
     * @extends MemoryRegion
     */
    class InterruptController extends MemoryRegion {
        constructor() {
            super();

            this.name = "INT_CTRL";
            
            // --- Registradores Mapeados (Offsets relativos a 0x080Axxxx) ---
            // Baseado na documentação técnica do SPCE3200
            this.regs = {
                INT_MASK:   0x0000, // [RW] Máscara: Define quais IRQs são permitidas
                INT_PRIO:   0x0000, // [RW] Prioridade: Define ordem de atendimento (simulado)
                INT_STATUS: 0x0000, // [R]  Status: Bits ativos indicam IRQs pendentes
                INT_ACK:    0x0000  // [W]  Acknowledge: Escrita limpa o bit no Status
            };

            // --- Vetores de Interrupção Padrão do HyperScan ---
            this.IRQ_TIMER  = 1; // Timer 0-2 Underflow
            this.IRQ_EXT    = 2; // External IRQ
            this.IRQ_VBLANK = 4; // Video Vertical Blank (Crítico para jogos)
            this.IRQ_UART   = 5; // UART RX/TX
            this.IRQ_ADC    = 6; // Audio / ADC

            // --- Estatísticas ---
            this.stats = {
                triggered: 0,
                processed: 0,
                blocked: 0
            };

            console.log("[INTC] ✓ InterruptController inicializado");
        }

        /**
         * Método chamado pelos periféricos para solicitar uma interrupção.
         * @param {CPU} cpu - Instância da CPU para invocar a exceção.
         * @param {number} irqNumber - O número da IRQ (ex: 4 para VBlank).
         */
        trigger(cpu, irqNumber) {
            if (irqNumber < 0 || irqNumber > 31) {
                console.warn(`[INTC] ⚠️ IRQ número inválido: ${irqNumber}`);
                return;
            }

            this.stats.triggered++;

            // 1. Marca a interrupção como "Pendente" no registrador de Status
            // O bitshift (1 << irqNumber) define qual flag levantar.
            this.regs.INT_STATUS |= (1 << irqNumber);

            // 2. Verifica se esta interrupção específica está habilitada na Máscara
            // Se o bit correspondente no INT_MASK for 1, a interrupção pode passar.
            const isEnabled = (this.regs.INT_MASK & (1 << irqNumber)) !== 0;

            // 3. Verifica se a CPU existe e se a interrupção deve ser processada
            if (cpu && isEnabled) {
                // Invoca a exceção na CPU.
                // A CPU S+core usa a interrupção para saltar para o vetor definido em CR[3].
                cpu.exception(irqNumber);
                this.stats.processed++;
            } else {
                this.stats.blocked++;
                if (!isEnabled) {
                    console.log(`[INTC] ℹ️ IRQ${irqNumber} bloqueada pela máscara`);
                }
            }
        }

        /* =========================================================
         * INTERFACE DE MEMÓRIA (MMIO)
         * Chamados pela MIU (io.js) quando a CPU lê/escreve em 0x080Axxxx
         * ======================================================= */

        /**
         * ✅ CORRIGIDO: Lê um byte (8 bits)
         */
        readU8(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 3) * 8;
            return (word >>> shift) & 0xFF;
        }

        /**
         * ✅ CORRIGIDO: Lê uma halfword (16 bits)
         */
        readU16(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 2) * 8;
            return (word >>> shift) & 0xFFFF;
        }

        /**
         * Lê um registrador de 32 bits.
         */
        readU32(address) {
            const offset = address & 0xFFFF; // Pega apenas os últimos 16 bits

            switch (offset) {
                case 0x0000: // INT_MASK (0x080A0000)
                    return this.regs.INT_MASK;

                case 0x0004: // INT_PRIO (0x080A0004)
                    return this.regs.INT_PRIO;

                case 0x0008: // INT_STATUS (0x080A0008)
                    // Retorna quais interrupções estão esperando tratamento
                    return this.regs.INT_STATUS;

                case 0x000C: // INT_ACK (Geralmente Write-Only, retorna 0)
                    return 0;

                default:
                    // Endereços não mapeados retornam 0 no hardware real
                    return 0;
            }
        }

        /**
         * ✅ CORRIGIDO: Escreve um byte (8 bits)
         */
        writeU8(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 3) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFF << shift)) | ((value & 0xFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * ✅ CORRIGIDO: Escreve uma halfword (16 bits)
         */
        writeU16(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 2) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFFFF << shift)) | ((value & 0xFFFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * Escreve em um registrador de 32 bits.
         */
        writeU32(address, value) {
            const offset = address & 0xFFFF;

            switch (offset) {
                case 0x0000: // INT_MASK
                    // A ROM escreve aqui para ligar/desligar IRQs.
                    this.regs.INT_MASK = value;
                    console.log(`[INTC] Máscara atualizada: 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                    break;

                case 0x0004: // INT_PRIO
                    this.regs.INT_PRIO = value;
                    break;

                case 0x0008: // INT_STATUS
                    // Geralmente Read-Only. Escritas aqui não costumam ter efeito direto
                    // ou podem ser usadas para forçar uma IRQ (software interrupt).
                    // No emulador, protegemos e deixamos read-only.
                    break;

                case 0x000C: // INT_ACK (0x080A000C)
                    // Acknowledge: Limpa as interrupções pendentes.
                    // Escrever 1 num bit limpa a interrupção correspondente no STATUS.
                    // Ex: Se STATUS for 00010000 (IRQ 4 pendente) e escrevermos 00010000 no ACK,
                    // o STATUS vira 0.
                    this.regs.INT_STATUS &= ~value;
                    console.log(`[INTC] ACK: Limpas IRQs 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
                    break;

                default:
                    // Endereço desconhecido - ignorar
                    break;
            }
        }

        /* =========================================================
         * MÉTODOS DE COMPATIBILIDADE COM MEMORYGREGION
         * Garantem que a classe funcione com SegmentedMemoryRegion
         * ======================================================= */

        /**
         * Retorna informações sobre o controlador
         */
        getInfo() {
            return {
                type: this.constructor.name,
                name: this.name,
                registers: {
                    INT_MASK: `0x${this.regs.INT_MASK.toString(16).padStart(8, '0').toUpperCase()}`,
                    INT_PRIO: `0x${this.regs.INT_PRIO.toString(16).padStart(8, '0').toUpperCase()}`,
                    INT_STATUS: `0x${this.regs.INT_STATUS.toString(16).padStart(8, '0').toUpperCase()}`
                },
                stats: { ...this.stats }
            };
        }

        /**
         * Validação de offset
         */
        isValidOffset(offset) {
            return offset >= 0 && offset <= 0x0F;
        }

        /**
         * Reseta o controlador
         */
        reset() {
            this.regs = {
                INT_MASK: 0x0000,
                INT_PRIO: 0x0000,
                INT_STATUS: 0x0000,
                INT_ACK: 0x0000
            };
            this.stats = {
                triggered: 0,
                processed: 0,
                blocked: 0
            };
            console.log("[INTC] Reset completo");
        }

        /**
         * Retorna status formatado para debug
         */
        getStatus() {
            const lines = [];
            lines.push("═══ INTERRUPT CONTROLLER STATUS ═══");
            lines.push(`INT_MASK:   0x${this.regs.INT_MASK.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`INT_PRIO:   0x${this.regs.INT_PRIO.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`INT_STATUS: 0x${this.regs.INT_STATUS.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push("");
            lines.push(`Triggered:  ${this.stats.triggered}`);
            lines.push(`Processed:  ${this.stats.processed}`);
            lines.push(`Blocked:    ${this.stats.blocked}`);
            lines.push("");
            
            // Mostrar IRQs ativas
            lines.push("Active IRQs:");
            for (let i = 0; i < 8; i++) {
                const bit = (this.regs.INT_STATUS >>> i) & 1;
                const masked = (this.regs.INT_MASK >>> i) & 1;
                if (bit || masked) {
                    const status = bit ? "🟢 PENDING" : "⚫ IDLE";
                    const mask = masked ? "ENABLED" : "DISABLED";
                    lines.push(`  IRQ${i}: ${status} (${mask})`);
                }
            }

            return lines.join("\n");
        }

        /**
         * Dump formatado
         */
        dump() {
            let output = "╔════════════════════════════════════╗\n";
            output += "║   INTERRUPT CONTROLLER (INTC)      ║\n";
            output += "╚════════════════════════════════════╝\n\n";
            output += this.getStatus();
            output += "\n";
            return output;
        }

        /**
         * Habilita uma IRQ específica
         */
        enableIRQ(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                this.regs.INT_MASK |= (1 << irqNumber);
                console.log(`[INTC] IRQ${irqNumber} habilitada`);
            }
        }

        /**
         * Desabilita uma IRQ específica
         */
        disableIRQ(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                this.regs.INT_MASK &= ~(1 << irqNumber);
                console.log(`[INTC] IRQ${irqNumber} desabilitada`);
            }
        }

        /**
         * Verifica se uma IRQ está habilitada
         */
        isIRQEnabled(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                return ((this.regs.INT_MASK >>> irqNumber) & 1) === 1;
            }
            return false;
        }

        /**
         * Verifica se uma IRQ está pendente
         */
        isIRQPending(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                return ((this.regs.INT_STATUS >>> irqNumber) & 1) === 1;
            }
            return false;
        }

        /**
         * Limpa uma IRQ pendente específica
         */
        clearIRQ(irqNumber) {
            if (irqNumber >= 0 && irqNumber < 32) {
                this.regs.INT_STATUS &= ~(1 << irqNumber);
                console.log(`[INTC] IRQ${irqNumber} limpa`);
            }
        }

        /**
         * Callback de mudança de status (para UI)
         */
        onStatusChange(status) {
            // Override em classes que usam INTC
        }
    }

    // ========== EXPORTAÇÃO GLOBAL ==========
    window.InterruptController = InterruptController;

    console.log("[INTC] ✓ InterruptController carregado");
    console.log("[INTC] ✓ Extends MemoryRegion - Compatível com MIU");
    console.log("[INTC] ✓ Suporta 32 IRQs (0-31)");
}
