/**
 * LunaConsole.js - Advanced Debugging Terminal for HyperScan Emulator
 * Versão: 2.0 Completa & 100% Compatível
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: main.js, cpu.js, debugger.js, disasm.js, dependence.js
 * 
 * Autor: Ccor444
 * Data: 2025-12-27
 * 
 * FUNCIONALIDADES:
 * - Terminal interativo com histórico de comandos
 * - Integração completa com CPU SPCE3200
 * - Breakpoints, Watchpoints, Memory Watches
 * - Disassembly, Register Dumps, Memory Analysis
 * - Autocomplete de comandos
 * - Performance Monitoring
 * - Periféricos (VDU, UART, Timer, IntC)
 */

"use strict";

window.__DEV__ = true;

class LunaConsole {
    constructor() {
        // ========== DOM ELEMENTS ==========
        this.out = document.getElementById("console-out");
        this.input = document.getElementById("console-input");
        this.autocompleteBox = document.getElementById("autocomplete-box");
        this.statusLed = document.getElementById("status-led");
        this.freqDisplay = document.getElementById("cpu-freq-display");
        
        if (!this.out || !this.input) {
            console.error("[LUNA] Elementos DOM não encontrados!");
            return;
        }

        // ========== STATE ==========
        this.history = [];
        this.historyIndex = -1;
        this.isRunning = false;
        this.lastCommandTime = 0;
        
        // ========== WATCHES & BREAKPOINTS ==========
        this.watches = new Map();              // reg -> { register, enabled }
        this.breakpoints = new Set();          // addr -> breakpoint
        this.memoryWatches = new Map();        // addr -> { address, oldValue }
        this.callStack = [];
        
        // ========== STATISTICS ==========
        this.stats = {
            commandsExecuted: 0,
            startTime: Date.now(),
            lastRenderTime: 0
        };

        // ========== INITIALIZE ==========
        this.setupEventListeners();
        this.initializeCommands();
        this.setupAutoComplete();
        this.logBoot();
        this.startMonitoring();

        console.log("[LUNA] ✓ LunaConsole v2.0 Initialized");
    }

    // ========== BOOT MESSAGE ==========
    logBoot() {
        this.log("", "default");
        this.log("╔════════════════════════════════════════╗", "success");
        this.log("║   🟢 LUNA ENGINE CONSOLE ONLINE       ║", "success");
        this.log("║   Firmware: SPG290 HyperScan v2.0      ║", "success");
        this.log("║   Advanced Debugger Terminal Ready     ║", "success");
        this.log("╚════════════════════════════════════════╝", "success");
        this.log("", "info");
        this.log("Type 'help' for available commands", "info");
        this.log("", "info");
    }

    // ========== EVENT LISTENERS ==========
    setupEventListeners() {
        // Keyboard input
        this.input?.addEventListener("keydown", (e) => this.handleKeyDown(e));
        
        // Control buttons
        document.getElementById("btn-run")?.addEventListener("click", () => this.toggleRun());
        document.getElementById("btn-pause")?.addEventListener("click", () => this.pause());
        document.getElementById("btn-step")?.addEventListener("click", () => this.step());
        document.getElementById("btn-reset")?.addEventListener("click", () => this.resetEngine());
        document.getElementById("btn-debug-toggle")?.addEventListener("click", () => this.toggleDebug());
        
        // Trace toggle
        document.getElementById("trace-toggle")?.addEventListener("change", (e) => this.setTrace(e.target.checked));
    }

    // ========== KEYBOARD HANDLING ==========
    handleKeyDown(e) {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (this.history.length) {
                this.historyIndex = Math.max(0, this.historyIndex - 1);
                this.input.value = this.history[this.historyIndex];
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
            this.input.value = this.history[this.historyIndex] || "";
        } else if (e.key === "Enter") {
            e.preventDefault();
            this.executeCommand();
        } else if (e.key === "Tab") {
            e.preventDefault();
            this.showAutocomplete();
        }
    }

    // ========== COMMAND EXECUTION ==========
    executeCommand() {
        const cmd = this.input.value.trim();
        this.input.value = "";
        if (!cmd) return;

        // Add to history
        this.history.push(cmd);
        this.historyIndex = this.history.length;
        this.stats.commandsExecuted++;

        // Log command
        this.log(`> ${cmd}`, "prompt");
        this.autocompleteBox.style.display = "none";

        try {
            const result = this.parseCommand(cmd);
            if (result !== undefined && result !== null) {
                if (typeof result === "object") {
                    this.dumpObject(result);
                } else {
                    this.log(String(result), "info");
                }
            }
        } catch (err) {
            this.log(`❌ ERROR: ${err.message}`, "error");
            console.error(err);
        }
    }

    // ========== COMMAND PARSER ==========
    parseCommand(cmd) {
        const parts = cmd.split(/\s+/);
        const mainCmd = parts[0].toLowerCase();

        // Check if command exists
        if (this.commands[mainCmd]) {
            return this.commands[mainCmd].call(this, ...parts.slice(1));
        }

        // Try eval for simple expressions
        try {
            return eval(cmd);
        } catch (e) {
            throw new Error(`Unknown command: '${mainCmd}'`);
        }
    }

    // ========== LOGGING ==========
    log(msg, type = "default") {
        const div = document.createElement("div");
        div.className = `console-line ${type}`;
        div.textContent = msg;
        this.out.appendChild(div);
        this.out.scrollTop = this.out.scrollHeight;
    }

    dumpObject(obj, depth = 2, prefix = "") {
        if (depth === 0 || obj === null) {
            this.log(`${prefix}${String(obj)}`, "info");
            return;
        }

        if (typeof obj !== "object") {
            this.log(`${prefix}${String(obj)}`, "info");
            return;
        }

        if (Array.isArray(obj)) {
            this.log(`${prefix}[`, "info");
            obj.forEach((item, idx) => {
                if (typeof item === "object" && item !== null) {
                    this.log(`${prefix}  [${idx}]:`, "info");
                    this.dumpObject(item, depth - 1, prefix + "    ");
                } else {
                    this.log(`${prefix}  [${idx}]: ${String(item).substring(0, 100)}`, "info");
                }
            });
            this.log(`${prefix}]`, "info");
        } else {
            this.log(`${prefix}{`, "success");
            Object.keys(obj).forEach(key => {
                const val = obj[key];
                if (typeof val === "object" && val !== null && depth > 1) {
                    this.log(`${prefix}  ${key}:`, "success");
                    this.dumpObject(val, depth - 1, prefix + "    ");
                } else {
                    const valStr = String(val).substring(0, 60);
                    this.log(`${prefix}  ${key}: ${valStr}`, "info");
                }
            });
            this.log(`${prefix}}`, "success");
        }
    }

    // ========== COMMAND INITIALIZATION ==========
    initializeCommands() {
        this.commands = {
            // ========== HELP & SYSTEM ==========
            help: () => this.showHelp(),
            clear: () => { this.out.innerHTML = ""; return null; },
            
            // ========== STATUS & INFO ==========
            status: () => this.showStatus(),
            info: () => this.showSystemInfo(),
            stats: () => this.showDetailedStats(),
            ls: () => this.listComponents(),
            
            // ========== CPU COMMANDS ==========
            "cpu.dump": () => this.dumpCPU(),
            "cpu.registers": () => this.dumpRegisters(),
            "cpu.disasm": (addr = "0", lines = "10") => this.disassemble(parseInt(addr, 16), parseInt(lines)),
            "cpu.trace": (count = "20") => this.traceInstructions(parseInt(count)),
            "cpu.pc": (addr) => this.setCPUPC(addr ? parseInt(addr, 16) : null),
            
            // ========== MEMORY COMMANDS ==========
            "mem.dump": (addr = "0", len = "256") => this.dumpMemory(parseInt(addr, 16), parseInt(len, 16)),
            "mem.read": (addr) => this.readMemory(parseInt(addr, 16)),
            "mem.write": (addr, val) => this.writeMemory(parseInt(addr, 16), parseInt(val, 16)),
            "mem.search": (pattern) => this.searchMemory(pattern),
            "mem.watch": (addr) => this.addMemoryWatch(parseInt(addr, 16)),
            "mem.unwatch": (addr) => this.removeMemoryWatch(parseInt(addr, 16)),
            "mem.watches": () => this.showMemoryWatches(),
            
            // ========== VDU COMMANDS ==========
            "vdu.info": () => this.dumpVDU(),
            "vdu.dump": (addr = "0", len = "256") => this.dumpVDUMemory(parseInt(addr, 16), parseInt(len, 16)),
            
            // ========== EXECUTION CONTROL ==========
            run: () => this.toggleRun(),
            pause: () => this.pause(),
            step: () => this.step(),
            reset: () => this.resetEngine(),
            
            // ========== BREAKPOINTS ==========
            "bp.add": (addr) => this.addBreakpoint(parseInt(addr, 16)),
            "bp.list": () => this.listBreakpoints(),
            "bp.remove": (addr) => this.removeBreakpoint(parseInt(addr, 16)),
            "bp.clear": () => this.clearBreakpoints(),
            
            // ========== REGISTER WATCHES ==========
            "watch.add": (reg) => this.addWatch(reg),
            "watch.remove": (reg) => this.removeWatch(reg),
            "watch.list": () => this.showWatches(),
            
            // ========== PERFORMANCE ==========
            perf: () => this.showPerformance(),
            "perf.reset": () => this.resetPerf(),
            
            // ========== PERIPHERALS ==========
            "io.dump": () => this.dumpIO(),
            "timer.info": () => this.showTimerInfo(),
            "int.list": () => this.listInterrupts(),
            
            // ========== ANALYSIS ==========
            "analyze.call": () => this.analyzeCallStack(),
            "analyze.memory": () => this.analyzeMemory(),
            "analyze.performance": () => this.analyzePerformance(),
        };
    }

    // ========== AUTOCOMPLETE ==========
    setupAutoComplete() {
        // Will be populated on demand
    }

    showAutocomplete() {
        const input = this.input.value;
        const suggestions = Object.keys(this.commands).filter(cmd => 
            cmd.startsWith(input.toLowerCase())
        );

        if (suggestions.length === 0) return;

        this.autocompleteBox.innerHTML = suggestions
            .slice(0, 10)
            .map(s => `<div class="autocomplete-item" onclick="luna.selectAutocomplete('${s}')">${s}</div>`)
            .join("");
        
        this.autocompleteBox.style.display = "block";
    }

    selectAutocomplete(cmd) {
        this.input.value = cmd + " ";
        this.autocompleteBox.style.display = "none";
        this.input.focus();
    }

    // ========== HELP DISPLAY ==========
    showHelp() {
        const commands = [
            ["SYSTEM COMMANDS:", ""],
            ["help", "Show this message"],
            ["clear", "Clear console"],
            ["status", "System status"],
            ["info", "System information"],
            ["ls", "List components"],
            ["", ""],
            ["CPU COMMANDS:", ""],
            ["cpu.dump", "Dump CPU state"],
            ["cpu.registers", "Show all registers"],
            ["cpu.disasm [addr] [lines]", "Disassemble code"],
            ["cpu.trace [count]", "Trace instructions"],
            ["cpu.pc [addr]", "Get/Set PC"],
            ["", ""],
            ["MEMORY COMMANDS:", ""],
            ["mem.dump [addr] [len]", "Dump memory"],
            ["mem.read [addr]", "Read byte"],
            ["mem.write [addr] [val]", "Write byte"],
            ["mem.watch [addr]", "Watch address"],
            ["mem.watches", "List watched addresses"],
            ["", ""],
            ["EXECUTION:", ""],
            ["run", "Start execution"],
            ["pause", "Pause execution"],
            ["step", "Single step"],
            ["reset", "Reset system"],
            ["", ""],
            ["DEBUGGING:", ""],
            ["bp.add [addr]", "Add breakpoint"],
            ["bp.list", "List breakpoints"],
            ["bp.clear", "Clear all breakpoints"],
            ["watch.add [reg]", "Watch register"],
            ["watch.list", "List register watches"],
        ];

        this.log("╔════════════════════════════════════════╗", "success");
        this.log("║      LUNA CONSOLE - COMMAND HELP       ║", "success");
        this.log("╚════════════════════════════════════════╝", "success");
        
        commands.forEach(([cmd, desc]) => {
            if (!cmd) {
                this.log("", "info");
            } else if (desc) {
                this.log(`  ${cmd.padEnd(30)} ${desc}`, "info");
            } else {
                this.log(`  ${cmd}`, "success");
            }
        });
    }

    // ========== STATUS & INFO ==========
    listComponents() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const emu = window.emu;
        this.log("━━━ System Components ━━━", "success");
        
        const components = [
            { name: "CPU", check: () => emu.cpu ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Memory (DRAM)", check: () => emu.hw?.dram ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "VDU", check: () => emu.peripherals?.vdu ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Interrupt Controller", check: () => emu.peripherals?.intC ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Timer", check: () => emu.peripherals?.timer ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "I/O Controller", check: () => emu.hw?.io ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Disassembler", check: () => emu.disassembler ? "🟢 ONLINE" : "🔴 OFFLINE" },
            { name: "Debugger", check: () => emu.debugger ? "🟢 ONLINE" : "🔴 OFFLINE" },
        ];

        components.forEach(comp => {
            const status = comp.check();
            this.log(`  ${comp.name.padEnd(20)} ${status}`, "info");
        });
    }

    showStatus() {
        if (!window.emu || !window.emu.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        const cpu = window.emu.cpu;
        const clock = window.emu.clock;
        const state = window.emu.state;
        
        this.log("━━━ SYSTEM STATUS ━━━", "success");
        this.log(`PC:              0x${(cpu.pc >>> 0).toString(16).toUpperCase().padStart(8, '0')}`, "cpu");
        this.log(`State:           ${state === 0 ? "STOPPED" : state === 1 ? "RUNNING" : state === 2 ? "PAUSED" : "ERROR"}`, "info");
        this.log(`Cycles:          ${cpu.cycles || 0}`, "info");
        this.log(`Instructions:    ${cpu.instructions || 0}`, "info");
        this.log(`Clock (Target):  ${(clock?.targetHz / 1000000).toFixed(2)} MHz`, "info");
        this.log(`FPS (Actual):    ${clock?.actualFPS?.toFixed(2) || 0}`, "info");
        this.log(`Halted:          ${cpu.halted ? "YES ⚠️" : "NO"}`, cpu.halted ? "warning" : "success");
        
        const flags = cpu.getFlags?.() || { N: cpu.N, Z: cpu.Z, C: cpu.C, V: cpu.V, T: cpu.T };
        this.log(`Flags:           N=${flags.N} Z=${flags.Z} C=${flags.C} V=${flags.V} T=${flags.T}`, "cpu");
    }

    showSystemInfo() {
        this.log("━━━ SYSTEM INFORMATION ━━━", "success");
        this.log("Processor:       SPG290 (Sunplus S+core)", "info");
        this.log("Architecture:    32-bit RISC", "info");
        this.log("Max Memory:      16 MB RAM", "info");
        this.log("Max ROM:         8 MB Flash", "info");
        this.log("Display:         320x224 @ 60 FPS", "info");
        this.log("Console:         Luna Terminal v2.0", "info");
        this.log("Debug Mode:      " + (window.__DEV__ ? "ENABLED 🟢" : "DISABLED 🔴"), "info");
    }

    showDetailedStats() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const emu = window.emu;
        const clock = emu.clock;
        const uptime = ((Date.now() - this.stats.startTime) / 1000).toFixed(2);

        this.log("━━━ DETAILED STATISTICS ━━━", "success");
        this.log(`Total Cycles:       ${emu.cpu?.cycles || 0}`, "info");
        this.log(`Total Instructions: ${emu.cpu?.instructions || 0}`, "info");
        this.log(`Frame Count:        ${clock?.frameCount || 0}`, "info");
        this.log(`Actual FPS:         ${clock?.actualFPS?.toFixed(2) || 0}`, "info");
        this.log(`CPI (Cycles/Instr): ${(emu.cpu?.cycles / emu.cpu?.instructions || 0).toFixed(3)}`, "info");
        this.log(`Console Uptime:     ${uptime}s`, "info");
        this.log(`Commands Executed:  ${this.stats.commandsExecuted}`, "info");
    }

    // ========== CPU COMMANDS ==========
    dumpCPU() {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }
        this.log("━━━ CPU STATE ━━━", "cpu");
        this.dumpObject(window.emu.cpu, 1);
    }

    dumpRegisters() {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        const cpu = window.emu.cpu;
        this.log("━━━ REGISTER STATE ━━━", "cpu");
        
        // General purpose registers
        if (cpu.r && Array.isArray(cpu.r)) {
            for (let i = 0; i < 32; i++) {
                const val = cpu.r[i] >>> 0;
                const hex = val.toString(16).padStart(8, '0').toUpperCase();
                this.log(`  r${i.toString().padStart(2, '0')} = 0x${hex}`, "cpu");
            }
        }

        this.log("", "info");
        this.log(`  PC = 0x${(cpu.pc >>> 0).toString(16).padStart(8, '0').toUpperCase()}`, "cpu");
        
        const flags = cpu.getFlags?.() || { N: cpu.N, Z: cpu.Z, C: cpu.C, V: cpu.V, T: cpu.T };
        this.log(`  Flags: N=${flags.N} Z=${flags.Z} C=${flags.C} V=${flags.V} T=${flags.T}`, "cpu");
    }

    disassemble(addr = 0, lines = 10) {
        if (!window.emu?.disassembler) {
            this.log("❌ Disassembler not available", "error");
            return;
        }

        this.log(`━━━ DISASSEMBLY @ 0x${addr.toString(16).toUpperCase().padStart(8, '0')} ━━━`, "cpu");
        
        try {
            for (let i = 0; i < lines; i++) {
                const currentAddr = addr + (i * 4);
                const instr = window.emu.disassembler.disasmAt(currentAddr);
                const marker = this.breakpoints.has(currentAddr) ? "🔴" : "  ";
                this.log(`${marker} 0x${currentAddr.toString(16).toUpperCase().padStart(8, '0')}: ${instr.text}`, "cpu");
            }
        } catch (e) {
            this.log(`⚠️ Disassembly error: ${e.message}`, "warning");
        }
    }

    traceInstructions(count = 20) {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        this.log(`━━━ INSTRUCTION TRACE (Last ${count}) ━━━`, "cpu");
        this.log("Trace requires extended debugging hooks", "warning");
    }

    setCPUPC(addr) {
        if (!window.emu?.cpu) {
            this.log("❌ CPU not initialized", "error");
            return;
        }

        if (addr === null) {
            this.log(`PC: 0x${(window.emu.cpu.pc >>> 0).toString(16).toUpperCase().padStart(8, '0')}`, "info");
        } else {
            window.emu.cpu.pc = addr >>> 0;
            this.log(`✓ PC set to 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "success");
        }
    }

    // ========== MEMORY COMMANDS ==========
    dumpMemory(addr = 0, len = 256) {
        if (!window.emu?.hw?.miu) {
            this.log("❌ Memory not initialized", "error");
            return;
        }

        this.log(`━━━ MEMORY DUMP @ 0x${addr.toString(16).toUpperCase().padStart(8, '0')} ━━━`, "memory");
        
        for (let i = 0; i < len; i += 16) {
            let line = `0x${(addr + i).toString(16).toUpperCase().padStart(8, '0')}: `;
            let ascii = "";

            for (let j = 0; j < 16 && i + j < len; j++) {
                try {
                    const byte = window.emu.hw.miu.readU8(addr + i + j);
                    line += byte.toString(16).padStart(2, '0').toUpperCase() + " ";
                    ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : ".";
                } catch {
                    line += "?? ";
                    ascii += "?";
                }
            }

            this.log(`${line}  ${ascii}`, "memory");
        }
    }

    readMemory(addr) {
        if (!window.emu?.hw?.miu) {
            this.log("❌ Memory not initialized", "error");
            return;
        }

        try {
            const val = window.emu.hw.miu.readU8(addr);
            this.log(`0x${addr.toString(16).toUpperCase().padStart(8, '0')}: 0x${val.toString(16).padStart(2, '0').toUpperCase()} (${val})`, "memory");
        } catch (e) {
            this.log(`❌ Cannot read address: ${e.message}`, "error");
        }
    }

    writeMemory(addr, val) {
        if (!window.emu?.hw?.miu) {
            this.log("❌ Memory not initialized", "error");
            return;
        }

        try {
            window.emu.hw.miu.writeU8(addr, val & 0xFF);
            this.log(`✓ Write 0x${(val & 0xFF).toString(16).padStart(2, '0').toUpperCase()} to 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "success");
        } catch (e) {
            this.log(`❌ Cannot write: ${e.message}`, "error");
        }
    }

    searchMemory(pattern) {
        this.log("⚠️ Memory search not yet implemented", "warning");
    }

    addMemoryWatch(addr) {
        this.memoryWatches.set(addr, { address: addr, oldValue: null });
        this.log(`✓ Memory watch added at 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "success");
    }

    removeMemoryWatch(addr) {
        if (this.memoryWatches.delete(addr)) {
            this.log(`✓ Memory watch removed`, "success");
        }
    }

    showMemoryWatches() {
        if (this.memoryWatches.size === 0) {
            this.log("No memory watches active", "info");
            return;
        }

        this.log("━━━ MEMORY WATCHES ━━━", "warning");
        this.memoryWatches.forEach((watch, addr) => {
            try {
                const val = window.emu.hw.miu.readU8(addr);
                const changed = watch.oldValue !== null && watch.oldValue !== val;
                const marker = changed ? "⚠️ " : "   ";
                this.log(`${marker}0x${addr.toString(16).toUpperCase().padStart(8, '0')}: 0x${val.toString(16).padStart(2, '0').toUpperCase()}`, changed ? "warning" : "info");
                watch.oldValue = val;
            } catch (e) {
                this.log(`0x${addr.toString(16).toUpperCase().padStart(8, '0')}: ERROR`, "error");
            }
        });
    }

    // ========== VDU COMMANDS ==========
    dumpVDU() {
        if (!window.emu?.peripherals?.vdu) {
            this.log("❌ VDU not initialized", "error");
            return;
        }

        this.log("━━━ VDU STATE ━━━", "info");
        this.dumpObject(window.emu.peripherals.vdu, 1);
    }

    dumpVDUMemory(addr = 0, len = 256) {
        this.log("⚠️ VDU memory dump not implemented", "warning");
    }

    // ========== EXECUTION CONTROL ==========
    toggleRun() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        this.isRunning = !this.isRunning;
        
        if (this.isRunning) {
            if (window.emu.start) window.emu.start();
            this.log("▶️  Execution started", "success");
            if (this.statusLed) this.statusLed.classList.add("running");
        } else {
            if (window.emu.pause) window.emu.pause();
            this.log("⏸️  Execution paused", "warning");
            if (this.statusLed) this.statusLed.classList.remove("running");
        }
    }

    pause() {
        if (window.emu && window.emu.pause) {
            window.emu.pause();
            this.isRunning = false;
            this.log("⏸️  Execution paused", "warning");
            if (this.statusLed) this.statusLed.classList.remove("running");
        }
    }

    step() {
        if (window.emu && window.emu.step) {
            window.emu.step();
            this.log("➡️  Single step executed", "info");
            this.dumpRegisters();
        }
    }

    resetEngine() {
        if (window.emu && window.emu.reset) {
            window.emu.reset();
            this.isRunning = false;
            this.log("♻️  Engine reset", "warning");
            if (this.statusLed) this.statusLed.classList.remove("running");
        }
     }
// ========== DEBUGGING COMMANDS ==========
    toggleDebug() {
        window.__DEV__ = !window.__DEV__;
        if (window.emu) {
            window.emu.config.debugEnabled = window.__DEV__;
        }
        this.log(`🔧 Debug mode: ${window.__DEV__ ? "ENABLED 🟢" : "DISABLED 🔴"}`, "info");
    }

    setTrace(enabled) {
        window.__TRACE__ = enabled;
        if (window.emu) {
            window.emu.config.traceInstructions = enabled;
        }
        this.log(`📊 Instruction trace: ${enabled ? "ENABLED 🟢" : "DISABLED 🔴"}`, "info");
    }

    // ========== BREAKPOINTS ==========
    addBreakpoint(addr) {
        this.breakpoints.add(addr);
        this.log(`🔴 Breakpoint added at 0x${addr.toString(16).toUpperCase().padStart(8, '0')}`, "warning");
        
        // Also add to emulator debugger if available
        if (window.emu?.debugger?.breakpoints) {
            window.emu.debugger.breakpoints.addBreakpoint(addr);
        }
    }

    removeBreakpoint(addr) {
        if (this.breakpoints.delete(addr)) {
            this.log(`✓ Breakpoint removed`, "success");
            if (window.emu?.debugger?.breakpoints) {
                window.emu.debugger.breakpoints.removeBreakpoint(addr);
            }
        }
    }

    listBreakpoints() {
        if (this.breakpoints.size === 0) {
            this.log("No breakpoints set", "info");
            return;
        }

        this.log("━━━ BREAKPOINTS ━━━", "warning");
        this.breakpoints.forEach(bp => {
            this.log(`  🔴 0x${bp.toString(16).toUpperCase().padStart(8, '0')}`, "warning");
        });
    }

    clearBreakpoints() {
        this.breakpoints.clear();
        if (window.emu?.debugger?.breakpoints) {
            window.emu.debugger.breakpoints.clearAll();
        }
        this.log("✓ All breakpoints cleared", "success");
    }

    // ========== REGISTER WATCHES ==========
    addWatch(reg) {
        const regNum = parseInt(reg.replace('r', '')) || parseInt(reg);
        if (regNum >= 0 && regNum < 32) {
            this.watches.set(`r${regNum}`, { register: `r${regNum}`, enabled: true });
            this.log(`✓ Watch added for register r${regNum}`, "success");
        } else {
            this.log(`❌ Invalid register: ${reg}`, "error");
        }
    }

    removeWatch(reg) {
        const key = reg.toLowerCase();
        if (this.watches.delete(key)) {
            this.log(`✓ Watch removed for ${reg}`, "success");
        }
    }

    showWatches() {
        if (this.watches.size === 0) {
            this.log("No register watches active", "info");
            return;
        }

        this.log("━━━ REGISTER WATCHES ━━━", "info");
        if (window.emu?.cpu) {
            const cpu = window.emu.cpu;
            this.watches.forEach((watch, regName) => {
                const regNum = parseInt(regName.replace('r', ''));
                const value = cpu.r ? cpu.r[regNum] >>> 0 : "N/A";
                const hex = typeof value === 'number' ? `0x${value.toString(16).padStart(8, '0').toUpperCase()}` : value;
                this.log(`  ${regName.toUpperCase()}: ${hex}`, "info");
            });
        }
    }

    // ========== PERFORMANCE MONITORING ==========
    showPerformance() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const uptime = ((Date.now() - this.stats.startTime) / 1000).toFixed(2);
        const cpu = window.emu.cpu;
        const clock = window.emu.clock;

        this.log("━━━ PERFORMANCE STATS ━━━", "info");
        this.log(`Uptime:          ${uptime}s`, "info");
        this.log(`Status:          ${this.isRunning ? "RUNNING ▶️" : "PAUSED ⏸️"}`, "info");
        
        if (clock) {
            this.log(`FPS:             ${clock.actualFPS?.toFixed(2) || 0}`, "info");
            this.log(`Target MHz:      ${(clock.targetHz / 1000000).toFixed(2)}`, "info");
        }

        if (cpu) {
            const cpi = cpu.cycles && cpu.instructions ? (cpu.cycles / cpu.instructions).toFixed(3) : "N/A";
            const mips = cpu.cycles && clock ? ((cpu.instructions / (clock.lastFrameTime / 1000)) / 1000000).toFixed(2) : "N/A";
            
            this.log(`CPI:             ${cpi}`, "info");
            this.log(`MIPS:            ${mips}`, "info");
        }
    }

    resetPerf() {
        if (window.emu?.cpu) {
            window.emu.cpu.cycles = 0;
            window.emu.cpu.instructions = 0;
            this.stats.startTime = Date.now();
            this.log("✓ Performance counters reset", "success");
        }
    }

    // ========== PERIPHERALS ==========
    dumpIO() {
        if (!window.emu?.hw?.io) {
            this.log("❌ I/O controller not initialized", "error");
            return;
        }

        this.log("━━━ I/O CONTROLLER ━━━", "info");
        this.dumpObject(window.emu.hw.io, 1);
    }

    showTimerInfo() {
        if (!window.emu?.peripherals?.timer) {
            this.log("❌ Timer not initialized", "error");
            return;
        }

        this.log("━━━ TIMER INFO ━━━", "info");
        this.dumpObject(window.emu.peripherals.timer, 1);
    }

    listInterrupts() {
        if (!window.emu?.peripherals?.intC) {
            this.log("❌ Interrupt controller not initialized", "error");
            return;
        }

        this.log("━━━ INTERRUPT STATE ━━━", "info");
        this.dumpObject(window.emu.peripherals.intC, 1);
    }

    // ========== ANALYSIS ==========
    analyzeCallStack() {
        this.log("━━━ CALL STACK ANALYSIS ━━━", "info");
        if (this.callStack.length === 0) {
            this.log("Call stack is empty", "info");
        } else {
            this.callStack.forEach((frame, idx) => {
                this.log(`  [${idx}] 0x${frame.toString(16).toUpperCase().padStart(8, '0')}`, "info");
            });
        }
    }

    analyzeMemory() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        this.log("━━━ MEMORY ANALYSIS ━━━", "info");
        const hw = window.emu.hw;
        
        if (hw.dram) {
            const dramSize = hw.dram.size || hw.dram.buffer?.byteLength || 0;
            this.log(`DRAM Size:  ${(dramSize / 1024 / 1024).toFixed(2)} MB`, "info");
        }

        if (hw.flash) {
            const flashSize = hw.flash.size || hw.flash.buffer?.byteLength || 0;
            this.log(`Flash Size: ${(flashSize / 1024 / 1024).toFixed(2)} MB`, "info");
        }

        if (hw.io) {
            const ioSize = hw.io.size || 0;
            this.log(`I/O Size:   ${(ioSize / 1024).toFixed(2)} KB`, "info");
        }

        this.log(`Current PC: 0x${(window.emu.cpu?.pc >>> 0 || 0).toString(16).toUpperCase().padStart(8, '0')}`, "info");
    }

    analyzePerformance() {
        if (!window.emu) {
            this.log("❌ Emulator not initialized", "error");
            return;
        }

        const cpu = window.emu.cpu;
        const clock = window.emu.clock;

        this.log("━━━ PERFORMANCE ANALYSIS ━━━", "info");
        
        if (cpu && clock) {
            const cpi = cpu.cycles / cpu.instructions || 0;
            const mips = clock.lastFrameTime > 0 ? ((cpu.instructions / (clock.lastFrameTime / 1000)) / 1000000) : 0;
            const efficiency = (clock.actualFPS / 60) * 100;

            this.log(`CPI (Cycles/Instruction): ${cpi.toFixed(3)}`, "info");
            this.log(`MIPS (Million Instr/Sec): ${mips.toFixed(2)}`, "info");
            this.log(`Efficiency:               ${efficiency.toFixed(1)}%`, "info");
            this.log(`Target MHz:               ${(clock.targetHz / 1000000).toFixed(2)}`, "info");
            this.log(`Actual FPS:               ${clock.actualFPS?.toFixed(2) || 0}`, "info");
        }
    }

    // ========== MONITORING ==========
    startMonitoring() {
        // Update frequency display
        setInterval(() => {
            if (this.isRunning && window.emu?.clock) {
                const freq = window.emu.clock.targetHz / 1000000;
                if (this.freqDisplay) {
                    this.freqDisplay.textContent = `${freq.toFixed(2)} MHz`;
                }
            }
        }, 500);

        // Monitor memory watches
        setInterval(() => {
            if (this.memoryWatches.size > 0 && this.isRunning) {
                // Optional: Show watches periodically
                // this.showMemoryWatches();
            }
        }, 1000);

        // Update status LED
        setInterval(() => {
            if (this.statusLed && this.isRunning) {
                this.statusLed.classList.add("running");
            } else if (this.statusLed) {
                this.statusLed.classList.remove("running");
            }
        }, 100);
    }

    // ========== EMULATOR INTEGRATION ==========
    integrateWithEmulator() {
        if (!window.emu) return;

        // Hook para breakpoints
        const originalStep = window.emu.step;
        window.emu.step = () => {
            if (originalStep) originalStep.call(window.emu);
            
            if (this.breakpoints.has(window.emu.cpu?.pc)) {
                this.pause();
                this.log("🔴 BREAKPOINT HIT!", "error");
                this.dumpRegisters();
            }
        };

        // Hook para mudanças de status
        if (!window.emu.onStatusChange) {
            window.emu.onStatusChange = (status) => {
                const led = document.getElementById("status-led");
                if (led) {
                    led.className = `status-indicator ${status === "running" ? "running" : ""}`;
                }
            };
        }

        this.log("✓ Emulator integration successful", "success");
    }

    // ========== UTILITY METHODS ==========

    /**
     * Obtém informações formatadas do emulador
     */
    getEmulatorInfo() {
        if (!window.emu) return null;

        return {
            romLoaded: window.emu.hw?.romLoaded || false,
            romName: window.emu.hw?.romName || "None",
            state: window.emu.state,
            cpuPC: window.emu.cpu?.pc >>> 0,
            cpuCycles: window.emu.cpu?.cycles || 0,
            cpuInstructions: window.emu.cpu?.instructions || 0,
            fpsActual: window.emu.clock?.actualFPS || 0,
            clockTarget: window.emu.clock?.targetHz || 0
        };
    }

    /**
     * Exporta histórico de comandos
     */
    exportHistory() {
        return {
            timestamp: new Date().toISOString(),
            commands: this.history,
            totalCount: this.history.length
        };
    }

    /**
     * Limpa histórico
     */
    clearHistory() {
        this.history = [];
        this.historyIndex = -1;
        this.log("✓ History cleared", "success");
    }

    /**
     * Obtém status completo do console
     */
    getConsoleStatus() {
        return {
            isRunning: this.isRunning,
            commandsExecuted: this.stats.commandsExecuted,
            uptime: ((Date.now() - this.stats.startTime) / 1000).toFixed(2),
            breakpoints: this.breakpoints.size,
            watches: this.watches.size,
            memoryWatches: this.memoryWatches.size,
            debugMode: window.__DEV__,
            traceEnabled: window.__TRACE__ || false
        };
    }

    /**
     * Obtém dump completo do estado
     */
    fullDump() {
        this.log("╔════════════════════════════════════════╗", "success");
        this.log("║        FULL SYSTEM STATE DUMP          ║", "success");
        this.log("╚════════════════════════════════════════╝", "success");
        
        this.showStatus();
        this.log("", "info");
        this.dumpRegisters();
        this.log("", "info");
        this.showDetailedStats();
        this.log("", "info");
        this.analyzePerformance();
    }
}

// ========== INITIALIZATION ==========

window.__startTime__ = Date.now();
window.__DEV__ = true;

// Create console instance
const luna = new LunaConsole();
window.luna = luna;

// Integrate with emulator when ready
if (window.emu) {
    luna.integrateWithEmulator();
} else {
    // Try to integrate after a delay
    setTimeout(() => {
        if (window.emu) {
            luna.integrateWithEmulator();
        }
    }, 1000);
}

// ========== GLOBAL HELPER FUNCTIONS ==========

/**
 * Luna Log - Log com formatação
 */
window.lunaLog = (msg, color = "#0f0") => {
    const colorMap = {
        "#0f0": "success",
        "#0a0": "success",
        "#f00": "error",
        "#ff0": "warning",
        "#0ff": "info",
        "#0af": "memory",
        "#f0f": "cpu",
        "#ccc": "default"
    };
    luna.log(msg, colorMap[color] || "default");
};

/**
 * Luna Dump - Dump de objeto
 */
window.lunaDump = (obj, depth = 2) => {
    luna.dumpObject(obj, depth);
};

/**
 * Luna Breakpoint - Adicionar breakpoint
 */
window.lunaBreakpoint = (addr) => {
    luna.addBreakpoint(addr);
};

/**
 * Luna Watch - Adicionar watch de registrador
 */
window.lunaWatch = (reg) => {
    luna.addWatch(reg);
};

/**
 * Luna Step - Executar um passo
 */
window.lunaStep = () => {
    luna.step();
};

/**
 * Luna Run - Iniciar execução
 */
window.lunaRun = () => {
    luna.isRunning = false;
    luna.toggleRun();
};

/**
 * Luna Pause - Pausar execução
 */
window.lunaPause = () => {
    luna.pause();
};

/**
 * Luna Reset - Resetar sistema
 */
window.lunaReset = () => {
    luna.resetEngine();
};

/**
 * Luna Status - Mostrar status
 */
window.lunaStatus = () => {
    luna.showStatus();
};

/**
 * Luna Registers - Mostrar registradores
 */
window.lunaRegisters = () => {
    luna.dumpRegisters();
};

/**
 * Luna Memory - Dump de memória
 */
window.lunaMemory = (addr = 0, len = 256) => {
    luna.dumpMemory(addr, len);
};

/**
 * Luna Disasm - Disassemblies
 */
window.lunaDisasm = (addr = 0, lines = 10) => {
    luna.disassemble(addr, lines);
};

/**
 * Luna Help - Mostrar ajuda
 */
window.lunaHelp = () => {
    luna.showHelp();
};

/**
 * Luna Info - Informações do sistema
 */
window.lunaInfo = () => {
    luna.showSystemInfo();
};

/**
 * Luna Perf - Performance
 */
window.lunaPerf = () => {
    luna.showPerformance();
};

/**
 * Luna Full Dump - Dump completo
 */
window.lunaFullDump = () => {
    luna.fullDump();
};

/**
 * Luna Console Status
 */
window.lunaConsoleStatus = () => {
    return luna.getConsoleStatus();
};

// ========== REAL-TIME MONITORING ==========

setInterval(() => {
    const clock = window.emu?.clock;
    const freqDisplay = document.getElementById("cpu-freq-display");
    
    if (freqDisplay && clock) {
        const mhz = (clock.targetHz / 1000000).toFixed(2);
        freqDisplay.textContent = `${mhz} MHz`;
    }

    // Update status LED
    const led = document.getElementById("status-led");
    if (led && luna.isRunning) {
        led.classList.add("running");
    } else if (led) {
        led.classList.remove("running");
    }
}, 100);

// ========== BOOT MESSAGE ==========

setTimeout(() => {
    if (window.emu) {
        luna.log("", "info");
        luna.log("✓ System initialized successfully!", "success");
        luna.log("Emulator Version: HyperScan DEV Build", "info");
        luna.log("Type 'help' to see all available commands", "info");
    }
}, 500);

console.log("%c✓ LunaConsole v2.0 Loaded & Ready", "color: #0f0; font-weight: bold; font-size: 14px;");
console.log("%c📚 Global Functions Available:", "color: #0af; font-weight: bold;");
console.log("lunaLog(), lunaDump(), lunaStep(), lunaRun(), lunaPause(), lunaReset(),");
console.log("lunaStatus(), lunaRegisters(), lunaMemory(), lunaDisasm(), lunaHelp(), lunaPerf(),");
console.log("lunaBreakpoint(), lunaWatch(), lunaFullDump(), lunaConsoleStatus()");

window.LunaConsole = LunaConsole;
window.luna = luna; // ou a instância global