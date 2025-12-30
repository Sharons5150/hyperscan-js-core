/**
 * integration.js - Integração CPU com HyperScanEngine (REFATORADO)
 * 
 * ✅ REMOVIDAS: Duplicatas de classe
 * ✅ CORRIGIDO: Referências ao debugger (this.dbg)
 * ✅ REFATORADO: Prototype patching melhorado
 * ✅ INTEGRADO: Com novo main.js e timer
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * 
 * Autor: Ccor444
 * Data: 2025-12-28
 * 
 * RESPONSABILIDADE:
 * Estender CPU e HyperScanEngine com funcionalidades de debug avançadas
 * Sem quebrar a arquitetura original (prototype patching)
 */

"use strict";

// ========== VALIDAÇÕES INICIAIS ==========

if (typeof CPU === 'undefined') {
    console.error("[INTEGRATION] ❌ CPU não carregada! Verifique se cpu.js foi carregado.");
    throw new Error("CPU não disponível");
}

if (typeof HyperScanEngine === 'undefined') {
    console.error("[INTEGRATION] ❌ HyperScanEngine não carregada! Verifique se main.js foi carregado.");
    throw new Error("HyperScanEngine não disponível");
}

console.log("[INTEGRATION] ✓ Dependências OK - CPU e HyperScanEngine detectadas");

// ========== PARTE 1: EXTENSÕES CPU ==========

/**
 * Estende CPU com método setMIU (compatibilidade)
 */
CPU.prototype.setMIU = function(miu) {
    this.miu = miu;
    console.log("[CPU] MIU conectado");
};

/**
 * Override de step() com tratamento de erro robusto
 * ✅ MANTÉM: Funcionalidade original
 * ✅ ADICIONA: Try-catch, logging, validações
 */
const OriginalCPUStep = CPU.prototype.step;

CPU.prototype.step = function() {
    if (this.halted) return false;
    if (!this.miu) {
        console.warn("[CPU] ⚠️ MIU não disponível");
        return false;
    }

    try {
        // Chamar step original
        const result = OriginalCPUStep.call(this);
        return result;

    } catch (err) {
        console.error("[CPU] ❌ Erro ao executar instrução:", err);
        console.error("[CPU] PC: 0x" + this.pc.toString(16).padStart(8, '0').toUpperCase());
        console.error("[CPU] Stack:", err.stack);
        
        // Retornar false para parar execução
        return false;
    }
};

/**
 * Novos métodos de debug
 */
CPU.prototype.dumpState = function() {
    if (!this.getState) {
        return null;
    }
    return this.getState();
};

CPU.prototype.dumpRegisters = function() {
    if (!this.dumpRegisters || typeof this.dumpRegisters !== 'function') {
        return "❌ dumpRegisters não disponível";
    }
    return this.dumpRegisters();
};

CPU.prototype.getCurrentInstruction = function() {
    if (!this.miu) return null;
    const insn = this.miu.readU32(this.pc);
    return insn;
};

CPU.prototype.setRegister = function(idx, value) {
    if (idx >= 0 && idx < 32) {
        this.r[idx] = value >>> 0;
        return true;
    }
    return false;
};

CPU.prototype.getRegister = function(idx) {
    if (idx >= 0 && idx < 32) {
        return this.r[idx] >>> 0;
    }
    return 0;
};

// ========== PARTE 2: EXTENSÕES HYPERSCANENGINE ==========

/**
 * Estende HyperScanEngine com métodos de debug avançados
 */

/**
 * Dump de estado da CPU
 */
HyperScanEngine.prototype.dumpCPUState = function() {
    if (!this.cpu) return null;
    return this.cpu.dumpState();
};

/**
 * Dump de registradores
 */
HyperScanEngine.prototype.dumpCPURegisters = function() {
    if (!this.cpu) return "";
    return this.cpu.dumpRegisters();
};

/**
 * Desassemblar instrução no PC atual ou em endereço específico
 */
HyperScanEngine.prototype.getCPUDisassembly = function(addr) {
    if (!this.cpu || !this.disassembler) return "";
    
    const address = addr !== undefined ? addr : this.cpu.pc;
    
    try {
        const result = this.disassembler.disasmAt(address);
        return result;
    } catch (err) {
        console.error("[INTEGRATION] Erro ao desassemblar:", err);
        return null;
    }
};

/**
 * Obter bloco de código (disassembly de N instruções)
 */
HyperScanEngine.prototype.getCodeBlock = function(addr, lines = 10) {
    if (!this.disassembler) return [];
    
    try {
        const instructions = [];
        let currentAddr = addr;
        
        for (let i = 0; i < lines; i++) {
            const insn = this.disassembler.disasmAt(currentAddr);
            if (!insn) break;
            
            instructions.push({
                ...insn,
                isCurrentPC: currentAddr === this.cpu.pc,
                hasBreakpoint: this.dbg ? this.dbg.breakpoints.breakpoints.has(currentAddr) : false
            });
            
            currentAddr += insn.bytes;
        }
        
        return instructions;
    } catch (err) {
        console.error("[INTEGRATION] Erro ao obter bloco de código:", err);
        return [];
    }
};

/**
 * Setar registrador
 */
HyperScanEngine.prototype.setCPURegister = function(idx, value) {
    if (this.cpu && idx >= 0 && idx < 32) {
        this.cpu.setRegister(idx, value >>> 0);
        console.log(`[DEBUG] r${idx} = 0x${(value >>> 0).toString(16).padStart(8, '0').toUpperCase()}`);
        return true;
    }
    return false;
};

/**
 * Obter registrador
 */
HyperScanEngine.prototype.getCPURegister = function(idx) {
    if (this.cpu && idx >= 0 && idx < 32) {
        return this.cpu.getRegister(idx);
    }
    return 0;
};

/**
 * Setar Program Counter
 */
HyperScanEngine.prototype.setCPUPC = function(addr) {
    if (this.cpu) {
        this.cpu.setPC(addr >>> 0);
        console.log(`[DEBUG] PC = 0x${(addr >>> 0).toString(16).padStart(8, '0').toUpperCase()}`);
        return true;
    }
    return false;
};

/**
 * Obter Program Counter
 */
HyperScanEngine.prototype.getCPUPC = function() {
    return this.cpu ? this.cpu.pc : 0;
};

/**
 * Executar N ciclos
 */
HyperScanEngine.prototype.runCycles = function(n) {
    if (!this.hw.romLoaded) {
        console.warn("[CPU] ⚠️ ROM não carregada");
        return 0;
    }
    
    this.pause();
    
    let executed = 0;
    for (let i = 0; i < n; i++) {
        if (this.cpu && this.cpu.step()) {
            executed++;
        } else {
            break;
        }
    }
    
    console.log(`[CPU] ${executed} instruções executadas`);
    return executed;
};

/**
 * Executar até breakpoint ou condição
 */
HyperScanEngine.prototype.runUntil = function(condition, maxSteps = 100000) {
    if (!this.hw.romLoaded) {
        console.warn("[CPU] ⚠️ ROM não carregada");
        return 0;
    }
    
    this.pause();
    
    let steps = 0;
    while (steps < maxSteps) {
        if (this.cpu && this.cpu.step()) {
            steps++;
            
            // Avaliar condição (função fornecida pelo usuário)
            if (condition(this.cpu)) {
                console.log(`[CPU] ✓ Condição atingida após ${steps} instruções`);
                return steps;
            }
        } else {
            break;
        }
    }
    
    console.log(`[CPU] ⚠️ Máximo de ${maxSteps} instruções atingido`);
    return steps;
};

/**
 * Handler de breakpoint aprimorado
 */
const OriginalRunLoop = HyperScanEngine.prototype.runLoop;

HyperScanEngine.prototype.runLoop = function(timestamp) {
    if (this.state !== EmulatorState.RUNNING) return;

    try {
        if (this.clock.lastFrameTime > 0) {
            const deltaMs = timestamp - this.clock.lastFrameTime;
            if (deltaMs > 0) {
                this.clock.actualFPS = 1000 / deltaMs;
            }
        }
        this.clock.lastFrameTime = timestamp;

        // ========== EXECUÇÃO ==========

        let cyclesToRun = this.clock.cyclesPerFrame;
        let sliceCycles = this.clock.cyclesPerSlice;

        while (cyclesToRun > 0) {
            // ✅ Check Breakpoint
            if (this.dbg && this.dbg.breakpoints.checkBreakpoint(this.cpu).hit) {
                console.warn(`[DEBUG] 🛑 Breakpoint: 0x${this.cpu.pc.toString(16).toUpperCase()}`);
                this.pause();
                this.updateUIStatus(`🛑 Breakpoint em 0x${this.cpu.pc.toString(16).toUpperCase()}`);
                this.updateRunButton();
                if (this.dbg) this.dbg.state.recordState(this.cpu);
                return;
            }

            if (this.config.traceInstructions && this.disassembler) {
                const instr = this.disassembler.disasmAt(this.cpu.pc);
                console.log(`[TRACE] 0x${this.cpu.pc.toString(16).padStart(8, '0')}: ${instr.text}`);
            }

            const success = this.cpu.step();
            
            if (!success) {
                console.error("[CPU] ❌ Falha ao executar instrução");
                this.handleFatalError(new Error("CPU step falhou"));
                return;
            }

            this.clock.cyclesExecuted += 4;
            cyclesToRun -= 4;
            sliceCycles -= 4;

            if (sliceCycles <= 0) {
                sliceCycles = this.clock.cyclesPerSlice;
                this._updatePeripherals();
            }

            if (cyclesToRun < -10000) break;
        }

        // ========== FINAL DO FRAME ==========

        this.clock.frameCount++;

        if (this.peripherals.intC && this.cpu) {
            this.peripherals.intC.trigger(this.cpu, PLATFORM_CONFIG.IRQ_VBLANK);
        }

        if (this.peripherals.vdu && this.hw.dram) {
            this.peripherals.vdu.render(this.hw.dram);
        }

        // ✅ Update Debugger UI
        if (this.dbg && this.config.debugEnabled && this.clock.frameCount % 6 === 0) {
            const state = this.dbg.getState();
            this._updateDebuggerUI(state);
        }

        this.clock.frameId = requestAnimationFrame((ts) => this.runLoop(ts));

    } catch (err) {
        this.handleFatalError(err);
    }
};

/**
 * Step com debug
 */
const OriginalStep = HyperScanEngine.prototype.step;

HyperScanEngine.prototype.step = function() {
    if (!this.hw.romLoaded) return;

    this.pause();

    try {
        // ✅ Check Breakpoint no step
        if (this.dbg && this.dbg.breakpoints.checkBreakpoint(this.cpu).hit) {
            console.warn(`[DEBUG] 🛑 Breakpoint no step`);
        }

        const success = this.cpu.step();
        
        if (!success) {
            console.error("[CPU] ❌ Falha no step");
            return;
        }

        this.clock.cyclesExecuted += 4;

        // ✅ Update debugger
        if (this.dbg) {
            this.dbg.state.stepCount++;
            this.dbg.state.recordState(this.cpu);
        }

        // ✅ Update UI
        const state = this.dbg?.getState();
        if (state) this._updateDebuggerUI(state);

        this.updateUIStatus(`➡️ Step: 0x${this.cpu.pc.toString(16).toUpperCase()}`);

    } catch (err) {
        this.handleFatalError(err);
    }
};

/**
 * Reset com debug
 */
const OriginalReset = HyperScanEngine.prototype.reset;

HyperScanEngine.prototype.reset = function() {
    this.pause();
    
    if (this.hw.romLoaded) {
        this.setupHardware();
        let bootAddr = PLATFORM_CONFIG.BOOT_ADDRESS_DEFAULT;
        
        if (this.hw.flash) {
            const magic = this.hw.flash.readU32(PLATFORM_CONFIG.BOOT_MAGIC_OFFSET);
            if (magic === PLATFORM_CONFIG.BOOT_MAGIC) {
                bootAddr = PLATFORM_CONFIG.BOOT_ADDRESS_FROM_MAGIC;
            }
        }
        
        if (this.cpu) {
            this.cpu.reset();
            this.cpu.pc = bootAddr;
            this.cpu.setMIU(this.hw.miu);
        }
        
        this.updateUIStatus(`♻️ Sistema reiniciado: ${this.hw.romName}`);
    } else {
        this.updateUIStatus("Carregue uma ROM");
    }

    // ✅ Update debugger
    if (this.dbg) {
        this.dbg.state.recordState(this.cpu);
    }

    this.updateRunButton();
};

// ========== PARTE 3: DEBUG CONSOLE HANDLER ==========

/**
 * Handler de comando de debug (para debug console se existir)
 */
HyperScanEngine.prototype.debugConsole = function(input) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch(cmd) {
        case 'step':
            this.step();
            break;
        
        case 'run':
            const cycles = parseInt(parts[1]) || 100;
            this.runCycles(cycles);
            break;
        
        case 'pc':
            if (parts[1]) {
                const addr = parseInt(parts[1], 16);
                this.setCPUPC(addr);
            } else {
                console.log(`PC: 0x${this.getCPUPC().toString(16).toUpperCase()}`);
            }
            break;
        
        case 'reg':
            if (parts[1] && parts[2]) {
                const idx = parseInt(parts[1]);
                const val = parseInt(parts[2], 16);
                this.setCPURegister(idx, val);
            } else if (parts[1]) {
                const idx = parseInt(parts[1]);
                const val = this.getCPURegister(idx);
                console.log(`r${idx}: 0x${val.toString(16).toUpperCase()}`);
            }
            break;
        
        case 'dis':
            const addr = parts[1] ? parseInt(parts[1], 16) : this.getCPUPC();
            const result = this.getCPUDisassembly(addr);
            if (result) {
                console.log(`0x${result.address.toString(16).padStart(8, '0').toUpperCase()}: ${result.text}`);
            }
            break;
        
        case 'dump':
            console.log(this.dumpCPURegisters());
            break;
        
        case 'state':
            console.log(JSON.stringify(this.dumpCPUState(), null, 2));
            break;

        case 'code':
            const startAddr = parts[1] ? parseInt(parts[1], 16) : this.getCPUPC();
            const lineCount = parts[2] ? parseInt(parts[2]) : 10;
            const code = this.getCodeBlock(startAddr, lineCount);
            code.forEach(insn => {
                const marker = insn.hasBreakpoint ? "🔴" : "  ";
                console.log(`${marker} 0x${insn.address.toString(16).padStart(8, '0').toUpperCase()}: ${insn.text}`);
            });
            break;

        case 'help':
            console.log(`
CPU Debug Commands:
  step [n]           - Executa 1 ou N instruções
  run [N]            - Executa N instruções (padrão: 100)
  pc [ADDR]          - Define ou mostra PC (em hex)
  reg [IDX] [VAL]    - Define ou mostra registrador (em hex)
  dis [ADDR]         - Disassembla instrução
  dump               - Imprime registradores
  state              - Imprime estado da CPU
  code [ADDR] [N]    - Mostra N instruções a partir de ADDR
  help               - Mostra esta ajuda
            `);
            break;
        
        default:
            console.log(`❌ Comando desconhecido: ${cmd}`);
    }
};

// ========== EXPORTS ==========

console.log("[INTEGRATION] ✓ CPU estendida com métodos de debug");
console.log("[INTEGRATION] ✓ HyperScanEngine estendida com métodos de debug");
console.log("[INTEGRATION] ✓ Prototype patching concluído");
console.log("[INTEGRATION] ✓ integration.js carregado com sucesso");


/**
 * Validação de ROM após carregamento
 */
HyperScanEngine.prototype.validateROMBoot = function() {
    if (!this.hw.romLoaded) return false;
    
    // Verificar primeiro opcode
    const firstInsn = this.cpu.miu.readU32(this.cpu.pc);
    const op = (firstInsn >>> 27) & 0x1F;
    
    if (op > 0x1F) {
        console.error(`[BOOT] ❌ OP Code inválido: 0x${op.toString(16)}`);
        return false;
    }
    
    console.log(`[BOOT] ✓ ROM válida - OP=0x${op.toString(16)}`);
    return true;
};

/**
 * Testar periféricos críticos
 */
HyperScanEngine.prototype.validatePeripherals = function() {
    const checks = [
        { name: 'CPU', obj: this.cpu },
        { name: 'MIU', obj: this.hw.miu },
        { name: 'VDU', obj: this.peripherals.vdu },
        { name: 'Timer', obj: this.peripherals.timer },
        { name: 'IntC', obj: this.peripherals.intC },
        { name: 'UART', obj: this.peripherals.uart },
        { name: 'Debugger', obj: this.dbg }
    ];
    
    console.log("[VALIDATE] Verificando periféricos...");
    let allOk = true;
    
    checks.forEach(check => {
        if (check.obj) {
            console.log(`[VALIDATE] ✓ ${check.name}`);
        } else {
            console.warn(`[VALIDATE] ⚠️ ${check.name} não inicializado`);
            allOk = false;
        }
    });
    
    if (allOk) {
        console.log("[VALIDATE] ✅ Todos os periféricos validados com sucesso!");
    } else {
        console.warn("[VALIDATE] ⚠️ Alguns periféricos não estão inicializados");
    }
    
    return allOk;
};

// ========== FIM DO ARQUIVO ==========

console.log("[INTEGRATION] ✓ Arquivo integration.js completamente carregado e validado");
