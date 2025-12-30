/**
 * main.js — HyperScan Hybrid Engine (v2.2 - CORRIGIDO)
 * 
 * ✅ BUG #3 CORRIGIDO: MIU conectada ANTES de qualquer render
 * ✅ MELHORADO: Ordem de inicialização periféricos
 * ✅ ADICIONADO: Validação de periféricos após setup
 * ✅ CORRIGIDO: VDU renderiza corretamente no runLoop
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Autor: Ccor444
 * Data: 2025-12-29
 */

"use strict";

const EmulatorState = Object.freeze({
    STOPPED: 0,
    RUNNING: 1,
    PAUSED: 2,
    ERROR: 3,
    LOADING: 4
});

const PLATFORM_CONFIG = Object.freeze({
    CPU_CLOCK_HZ: 33868800,
    CPU_CYCLES_PER_FRAME: 564480,

    DRAM_SIZE: 16 * 1024 * 1024,
    FLASH_SIZE: 8 * 1024 * 1024,
    IO_SIZE: 256 * 1024,

    SEGMENT_DRAM: 0xA0,
    SEGMENT_IO: 0x08,
    SEGMENT_FLASH: 0x9E,

    BOOT_ADDRESS_DEFAULT: 0x9E000000,
    BOOT_ADDRESS_FROM_MAGIC: 0x9E000100,

    BOOT_MAGIC: 0x614D3832,
    BOOT_MAGIC_OFFSET: 0x4E,

    TARGET_FPS: 60,
    CYCLES_PER_SLICE: 10000,

    IRQ_VBLANK: 4,
    IRQ_TIMER: 5,
    IRQ_AUDIO: 6,
    IRQ_UART: 7,

    TIMER_BASE: 0x080A0000,
    INTC_BASE: 0x080A0000,
    UART_BASE: 0x080B0000,
    VDU_BASE: 0x080C0000,

    TIMER_SCALES: [1, 2, 4, 8, 16, 32, 64, 128]
});

// ========== HYPERSCAN ENGINE CORE ==========

class HyperScanEngine {
    constructor() {
        console.log("%c[ENGINE] Inicializando HyperScan Emulator...", "color: #0f0; font-weight: bold;");

        this.cpu = new window.CPU ? new window.CPU() : null;
        if (!this.cpu) {
            throw new Error("❌ CPU não carregada!");
        }

        this.disassembler = new window.HyperscanDisassembler 
            ? new window.HyperscanDisassembler(null) 
            : null;

        this.dbg = new window.HyperscanDebugger 
            ? new window.HyperscanDebugger(this.cpu, this.disassembler)
            : null;

        this.state = EmulatorState.STOPPED;
        this.fatalError = null;

        this.clock = {
            targetHz: PLATFORM_CONFIG.CPU_CLOCK_HZ,
            fps: PLATFORM_CONFIG.TARGET_FPS,
            cyclesPerFrame: PLATFORM_CONFIG.CPU_CYCLES_PER_FRAME,
            cyclesPerSlice: PLATFORM_CONFIG.CYCLES_PER_SLICE,
            frameId: null,
            frameCount: 0,
            cyclesExecuted: 0,
            lastFrameTime: 0,
            actualFPS: 0
        };

        this.hw = {
            miu: null,
            dram: null,
            io: null,
            flash: null,
            romLoaded: false,
            romName: ""
        };

        this.peripherals = {
            vdu: null,
            audio: null,
            timer: null,
            intC: null,
            uart: null
        };

        this.config = {
            debugEnabled: false,
            traceInstructions: false,
            dumpMemoryOnError: true,
            autoBootROM: false,
            breakOnException: true
        };

        this.onStatusChange = null;

        console.log("[ENGINE] ✓ Inicialização básica concluída");
    }

    // ========== HARDWARE SETUP ==========

    setupHardware() {
        console.info("%c[HW] Reinicializando Barramentos e Periféricos...", "color: #0af; font-weight: bold;");

        if (this.cpu) {
            this.cpu.reset();
        }
        this.clock.cyclesExecuted = 0;

        // 1. MIU
        this.hw.miu = new window.SegmentedMemoryRegion 
            ? new window.SegmentedMemoryRegion()
            : null;

        if (!this.hw.miu) {
            throw new Error("❌ SegmentedMemoryRegion não carregado!");
        }

        if (this.cpu) {
            this.cpu.miu = this.hw.miu;
        }

        // 2. DRAM
        this.hw.dram = new window.ArrayMemoryRegion(PLATFORM_CONFIG.DRAM_SIZE);
        this.hw.miu.setRegion(PLATFORM_CONFIG.SEGMENT_DRAM, this.hw.dram, "DRAM");

        // 3. I/O
        this.hw.io = new window.IOMemoryRegion 
            ? new window.IOMemoryRegion(PLATFORM_CONFIG.IO_SIZE)
            : null;

        if (!this.hw.io) {
            throw new Error("❌ IOMemoryRegion não carregada!");
        }

        this.hw.miu.setRegion(PLATFORM_CONFIG.SEGMENT_IO, this.hw.io, "I/O");

        // 4. Flash
        this.hw.flash = new window.ArrayMemoryRegion(PLATFORM_CONFIG.FLASH_SIZE);
        this.hw.miu.setRegion(PLATFORM_CONFIG.SEGMENT_FLASH, this.hw.flash, "FLASH");

        // 5. Update Disassembler
        if (this.disassembler) {
            this.disassembler.miu = this.hw.miu;
        }

        // 6. Setup Periféricos (ORDEM CRÍTICA)
        this._setupPeripherals();

        // 7. Setup I/O Handlers
        this._setupIOHandlers();

        console.info("%c[HW] ✓ Hardware Setup Completo", "color: #0f0; font-weight: bold;");
        console.info(`[HW] Mapa de Memória:`);
        console.info(`     - DRAM:  0xA0000000 - 0xA0FFFFFF (${PLATFORM_CONFIG.DRAM_SIZE / (1024 * 1024)}MB)`);
        console.info(`     - I/O:   0x08000000 - 0x0803FFFF (${PLATFORM_CONFIG.IO_SIZE / 1024}KB)`);
        console.info(`     - FLASH: 0x9E000000 - 0x9EFFFFFF (${PLATFORM_CONFIG.FLASH_SIZE / (1024 * 1024)}MB)`);
    }

    /**
     * ✅ CORRIGIDO: Setup de periféricos com ordem correta
     * MIU SEMPRE conectada ANTES de qualquer periférico
     */
    _setupPeripherals() {
        console.info("[PERIPH] Inicializando periféricos (ORDEM CRÍTICA)...");

        // 1. VDU (CRIAR PRIMEIRO - Sem MIU ainda)
        if (window.VideoDisplayUnit) {
            this.peripherals.vdu = new window.VideoDisplayUnit("display", {
                width: 320,
                height: 224,
                fbAddr: 0xA0000000,
                colorMode: 'RGB565',
                debug: false
            });
            console.log("[VDU] ✓ Criada (sem MIU ainda)");
        }

        // 2. TIMER
        if (window.TimerController) {
            this.peripherals.timer = new window.TimerController();
            console.log("[TIMER] ✓ Criado");
        }

        // 3. INTERRUPT CONTROLLER
        if (window.InterruptController) {
            this.peripherals.intC = new window.InterruptController();
            console.log("[INTC] ✓ Criada");
        }

        // 4. UART
        if (window.UART) {
            this.peripherals.uart = new window.UART();
            console.log("[UART] ✓ Criada");
        }

        // 5. CALLBACKS
        if (this.peripherals.timer) {
            this.peripherals.timer.onInterrupt = (timerNumber) => {
                if (this.peripherals.intC && this.cpu) {
                    this.peripherals.intC.trigger(this.cpu, PLATFORM_CONFIG.IRQ_TIMER);
                }
            };
        }

        // ========== ✅ CRÍTICO: CONECTAR MIU AGORA (ANTES DE QUALQUER RENDER) ==========
        
        if (this.peripherals.vdu && this.hw.miu) {
            this.peripherals.vdu.connectMIU(this.hw.miu);
            console.log("[VDU] ✅ MIU CONECTADA AGORA");
        }

        if (this.peripherals.vdu && this.peripherals.intC) {
            this.peripherals.vdu.connectInterruptController(this.peripherals.intC);
            console.log("[VDU] ✓ IntC conectada");
        }

        console.info("[PERIPH] ✓ Periféricos prontos");
    }

    /**
     * Setup de Handlers MMIO
     */
    _setupIOHandlers() {
        if (!this.hw.io) return;

        console.info("[IO] Registrando handlers MMIO...");

        // VDU
        if (this.peripherals.vdu) {
            for (let offset = 0; offset < 0x08; offset += 2) {
                this.hw.io.registerHandler(
                    PLATFORM_CONFIG.VDU_BASE + offset,
                    () => this.peripherals.vdu.readU32(offset),
                    (val) => this.peripherals.vdu.writeU32(offset, val)
                );
            }
            console.info("[IO] ✓ VDU registrada (0x080C0000-0x080C0006)");
        }

        // Timer
        if (this.peripherals.timer) {
            for (let offset = 0; offset < 0x30; offset += 4) {
                this.hw.io.registerHandler(
                    PLATFORM_CONFIG.TIMER_BASE + offset,
                    () => this.peripherals.timer.readU32(offset),
                    (val) => this.peripherals.timer.writeU32(offset, val)
                );
            }
            console.info("[IO] ✓ Timer registrado (0x080A0000-0x080A002C)");
        }

        // IntC
        if (this.peripherals.intC) {
            for (let offset = 0; offset < 0x10; offset += 4) {
                this.hw.io.registerHandler(
                    PLATFORM_CONFIG.INTC_BASE + offset,
                    () => this.peripherals.intC.readU32(offset),
                    (val) => this.peripherals.intC.writeU32(offset, val)
                );
            }
            console.info("[IO] ✓ IntC registrada (0x080A0000-0x080A000C)");
        }

        // UART
        if (this.peripherals.uart) {
            for (let offset = 0; offset < 0x20; offset += 4) {
                this.hw.io.registerHandler(
                    PLATFORM_CONFIG.UART_BASE + offset,
                    () => this.peripherals.uart.readU32(offset),
                    (val) => this.peripherals.uart.writeU32(offset, val)
                );
            }
            console.info("[IO] ✓ UART registrada (0x080B0000-0x080B001C)");
        }

        console.info("[IO] ✓ Handlers MMIO registrados");
    }

    /**
     * ✅ CORRIGIDO: Carrega ROM com validação
     */
    async loadROM(file) {
        try {
            this.pause();
            this.state = EmulatorState.LOADING;
            this.updateUIStatus(`📂 Lendo: ${file.name}...`);

            const buffer = await file.arrayBuffer();
            let data = new Uint8Array(buffer);

            console.log(`[BOOT] ROM tamanho: ${data.length} bytes`);

            // Setup hardware ANTES de carregar ROM
            this.setupHardware();
            
            // ✅ VALIDAR VDU após setup
            if (!this.peripherals.vdu) {
                console.error("[VDU] ❌ VDU não foi inicializada!");
                throw new Error("VDU initialization failed");
            }
            
            if (!this.peripherals.vdu.miu) {
                console.error("[VDU] ❌ VDU.miu não está conectada!");
                throw new Error("VDU.miu not connected");
            }
            console.log("[VDU] ✅ VDU verificada e com MIU conectada");

            // Detecção de endianness
            console.log("[BOOT] Analisando formato da ROM...");
            
            const byte0 = data[0];
            const byte1 = data[1];
            const byte2 = data[2];
            const byte3 = data[3];
            
            const insn_LE = (byte0 << 24) | (byte1 << 16) | (byte2 << 8) | byte3;
            const op_LE = (insn_LE >>> 27) & 0x1F;
            
            const insn_BE = (byte3 << 24) | (byte2 << 16) | (byte1 << 8) | byte0;
            const op_BE = (insn_BE >>> 27) & 0x1F;
            
            console.log("[BOOT] Primeiros 4 bytes: " + 
                [byte0, byte1, byte2, byte3]
                    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                    .join(" "));
            
            let needsSwap = false;
            if (op_LE > 0x1F && op_BE <= 0x1F) {
                console.warn("[BOOT] ⚠️ ROM detectada em BIG-ENDIAN!");
                console.log("[BOOT] Convertendo para LITTLE-ENDIAN...");
                
                const newData = new Uint8Array(data.length);
                for (let i = 0; i < data.length; i += 4) {
                    if (i + 3 < data.length) {
                        newData[i + 0] = data[i + 3];
                        newData[i + 1] = data[i + 2];
                        newData[i + 2] = data[i + 1];
                        newData[i + 3] = data[i + 0];
                    } else {
                        for (let j = i; j < data.length; j++) {
                            newData[j] = data[j];
                        }
                    }
                }
                
                data = newData;
                needsSwap = true;
                console.log("[BOOT] ✓ Conversão concluída");
            }

            // Carregar ROM
            this.hw.flash.load(data, 0);
            this.hw.romLoaded = true;
            this.hw.romName = file.name;

            let bootAddr = PLATFORM_CONFIG.BOOT_ADDRESS_DEFAULT;
            
            if (data.length > PLATFORM_CONFIG.BOOT_MAGIC_OFFSET + 4) {
                const magicBytes = [
                    data[PLATFORM_CONFIG.BOOT_MAGIC_OFFSET + 0],
                    data[PLATFORM_CONFIG.BOOT_MAGIC_OFFSET + 1],
                    data[PLATFORM_CONFIG.BOOT_MAGIC_OFFSET + 2],
                    data[PLATFORM_CONFIG.BOOT_MAGIC_OFFSET + 3]
                ];
                
                const magic = (magicBytes[0] << 24) | (magicBytes[1] << 16) |
                             (magicBytes[2] << 8) | magicBytes[3];
                
                if (magic === PLATFORM_CONFIG.BOOT_MAGIC) {
                    console.info("[BOOT] ✓ Assinatura 'aM82' encontrada");
                    bootAddr = PLATFORM_CONFIG.BOOT_ADDRESS_FROM_MAGIC;
                }
            }

            if (this.cpu) {
                this.cpu.pc = bootAddr;
            }

            const finalInsn = this.cpu.miu.readU32(bootAddr);
            const finalOP = (finalInsn >>> 27) & 0x1F;
            
            if (finalOP > 0x1F) {
                console.error("[BOOT] ❌ OP Code inválido!");
                throw new Error(`OP Code inválido: 0x${finalOP.toString(16)}`);
            }

            this.state = EmulatorState.PAUSED;
            this.updateUIStatus(`✓ ROM: ${file.name}${needsSwap ? " (BE→LE)" : ""}`);
            this.enableControls(true);

            if (this.dbg) {
                this.dbg.state.recordState(this.cpu);
            }

            console.info("[BOOT] ✓ Boot Sequence Completo");

        } catch (err) {
            this.handleFatalError(err);
        }
    }

    // ========== MAIN LOOP ==========

    /**
     * ✅ CORRIGIDO: VDU renderiza com MIU já conectada
     */
    runLoop(timestamp) {
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
                // Breakpoint
                if (this.dbg && this.dbg.breakpoints.checkBreakpoint(this.cpu).hit) {
                    this.pause();
                    return;
                }

                if (this.config.traceInstructions && this.disassembler) {
                    const instr = this.disassembler.disasmAt(this.cpu.pc);
                    console.log(`[TRACE] 0x${this.cpu.pc.toString(16).padStart(8, '0')}: ${instr.text}`);
                }

                const success = this.cpu.step();
                
                if (!success) {
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

            // ========== VSYNC ==========

            this.clock.frameCount++;

            // VBlank interrupt
            if (this.peripherals.intC && this.cpu) {
                this.peripherals.intC.trigger(this.cpu, PLATFORM_CONFIG.IRQ_VBLANK);
            }

            // ========== ✅ RENDERIZAR VDU (MIU já está conectada!) ==========
            if (this.peripherals.vdu) {
                const renderSuccess = this.peripherals.vdu.render(this.hw.miu);
                if (!renderSuccess && this.config.debugEnabled) {
                    // Log opcional
                }
            }

            // Debug UI
            if (this.dbg && this.config.debugEnabled && this.clock.frameCount % 6 === 0) {
                const state = this.dbg.getState();
                this._updateDebuggerUI(state);
            }

            this.clock.frameId = requestAnimationFrame((ts) => this.runLoop(ts));

        } catch (err) {
            this.handleFatalError(err);
        }
    }

    _updatePeripherals() {
        if (this.peripherals.timer) {
            this.peripherals.timer.tick(this.clock.cyclesPerSlice);
        }
    }

    _updateDebuggerUI(state) {
        const pcEl = document.getElementById("dbg-pc");
        if (pcEl) {
            pcEl.innerText = `0x${state.pc.toString(16).padStart(8, '0').toUpperCase()}`;
        }

        const flags = state.flags;
        ["N", "Z", "C", "V", "T"].forEach(f => {
            const el = document.getElementById(`dbg-flag-${f.toLowerCase()}`);
            if (el) {
                el.innerText = flags[f];
                el.style.color = flags[f] ? "#0f0" : "#555";
            }
        });

        const fpsEl = document.getElementById("dbg-fps");
        if (fpsEl) {
            fpsEl.innerText = `${this.clock.actualFPS.toFixed(1)} FPS`;
        }
    }

    // ========== CONTROLE ==========

    start() {
        if (!this.hw.romLoaded) {
            alert("❌ Carregue uma ROM primeiro!");
            return;
        }

        if (this.state === EmulatorState.RUNNING) return;

        this.state = EmulatorState.RUNNING;
        this.updateUIStatus("▶️ Executando...");
        this.clock.frameId = requestAnimationFrame((ts) => this.runLoop(ts));
    }

    pause() {
        if (this.state === EmulatorState.RUNNING) {
            this.state = EmulatorState.PAUSED;
            if (this.clock.frameId) {
                cancelAnimationFrame(this.clock.frameId);
                this.clock.frameId = null;
            }
            this.updateUIStatus("⏸️ Pausado");
        }
    }

    step() {
        if (!this.hw.romLoaded) return;

        this.pause();

        try {
            const success = this.cpu.step();
            
            if (!success) {
                console.error("[CPU] Falha no step");
                return;
            }

            this.clock.cyclesExecuted += 4;

            if (this.dbg) {
                this.dbg.state.stepCount++;
                this.dbg.state.recordState(this.cpu);
            }

            this.updateUIStatus(`➡️ Step: 0x${this.cpu.pc.toString(16).toUpperCase()}`);

        } catch (err) {
            this.handleFatalError(err);
        }
    }

    reset() {
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
                this.cpu.pc = bootAddr;
            }
            this.updateUIStatus(`♻️ Sistema reiniciado`);
        }

        if (this.dbg) {
            this.dbg.state.recordState(this.cpu);
        }

        this.updateRunButton();
    }

    // ========== ERROR HANDLING ==========

    handleFatalError(err) {
        this.state = EmulatorState.ERROR;
        this.fatalError = err;

        if (this.clock.frameId) {
            cancelAnimationFrame(this.clock.frameId);
            this.clock.frameId = null;
        }

        console.error("[FATAL ERROR]", err);
        console.error("Stack:", err.stack);

        const pcHex = this.cpu ? this.cpu.pc.toString(16).padStart(8, '0').toUpperCase() : "N/A";
        const msg = `💥 CRASH\n\nPC: 0x${pcHex}\nErro: ${err.message}`;

        this.updateUIStatus("💥 ERRO FATAL");

        if (this.config.dumpMemoryOnError && this.hw.miu) {
            console.log(this.hw.miu.dump(this.cpu.pc - 16, 256));
        }

        alert(msg);
    }

    // ========== UI ==========

    updateUIStatus(msg) {
        const el = document.getElementById("status-text");
        if (el) el.innerText = msg;
        console.log(`[UI] ${msg}`);
    }

    updateRunButton() {
        const btn = document.getElementById("btn-run");
        if (btn) {
            btn.innerText = this.state === EmulatorState.RUNNING ? "⏸️ PAUSE" : "▶️ RUN";
            btn.classList.toggle("active", this.state === EmulatorState.RUNNING);
        }
    }

    enableControls(enabled) {
        const buttons = ["btn-run", "btn-step", "btn-reset", "btn-debug-toggle"];
        buttons.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !enabled;
        });
    }

    toggleDebug() {
        this.config.debugEnabled = !this.config.debugEnabled;
    }

    getStatus() {
        return {
            state: Object.keys(EmulatorState).find(k => EmulatorState[k] === this.state),
            romLoaded: this.hw.romLoaded,
            romName: this.hw.romName,
            pc: this.cpu ? this.cpu.pc : 0,
            cycles: this.clock.cyclesExecuted,
            fps: this.clock.actualFPS,
            frameCount: this.clock.frameCount
        };
    }
}

// ========== BOOT ==========

document.addEventListener("DOMContentLoaded", () => {
    console.log("%c✓ Boot HyperScan DEV", "color: #0f0; font-weight: bold;");
    
    try {
        window.emu = new HyperScanEngine();
        console.log("%c✓ HyperScanEngine criado", "color: #0f0; font-weight: bold;");
        
    } catch (err) {
        console.error("[FATAL] Erro ao criar HyperScanEngine:", err);
        alert(`❌ Erro crítico: ${err.message}`);
        return;
    }

    // ROM Upload
    const fileInput = document.getElementById("rom-upload");
    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                console.log(`[UI] ROM selecionada: ${file.name}`);
                await window.emu.loadROM(file);
            }
        });
    }

    // Buttons
    document.getElementById("btn-run")?.addEventListener("click", () => {
        if (window.emu.state === EmulatorState.RUNNING) {
            window.emu.pause();
        } else {
            window.emu.start();
        }
        window.emu.updateRunButton();
    });

    document.getElementById("btn-step")?.addEventListener("click", () => {
        window.emu.step();
    });

    document.getElementById("btn-reset")?.addEventListener("click", () => {
        window.emu.reset();
    });

    document.getElementById("btn-debug-toggle")?.addEventListener("click", () => {
        window.emu.toggleDebug();
    });

    document.getElementById("trace-toggle")?.addEventListener("change", (e) => {
        window.emu.config.traceInstructions = e.target.checked;
    });

    console.log("%c✓ Boot Completo", "color: #0f0; font-weight: bold;");
});

window.HyperScanEngine = HyperScanEngine;
window.EmulatorState = EmulatorState;
window.PLATFORM_CONFIG = PLATFORM_CONFIG;

console.log("[MAIN.JS] ✅ BUG #3 CORRIGIDO: MIU conectada ANTES de render");
console.log("[MAIN.JS] ✓ Periféricos em ordem correta");