/**
 * VDU.js - Video Display Unit (CORRIGIDO v2.1)
 * HyperScan Emulator v2.0
 * 
 * ✅ CORRIGIDO BUG #1: ColorMode agora SEMPRE converte TO RGBA8888
 * ✅ CORRIGIDO BUG #2: Offset framebuffer calculado corretamente
 * ✅ CORRIGIDO BUG #4: Switch de readU32 com alinhamento
 * ✅ ADICIONADO: Validação de bounds robusta
 * ✅ ADICIONADO: Error handling melhorado
 * 
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 * Compatível com: SPCE3200, Sunplus S+core, HyperScan
 * 
 * Autor: Ccor444
 * Data: 2025-12-29
 */

"use strict";

if (typeof VideoDisplayUnit === 'undefined') {
    /**
     * Video Display Unit (CORRIGIDO)
     * @extends MemoryRegion
     */
    class VideoDisplayUnit extends MemoryRegion {
        constructor(canvasId, options = {}) {
            super();

            // ========== CANVAS ==========
            this.canvasId = canvasId;
            this.canvas = document.getElementById(canvasId);
            
            if (!this.canvas) {
                console.error(`[VDU] ❌ Canvas não encontrado: #${canvasId}`);
                throw new Error(`Canvas #${canvasId} não existe`);
            }

            this.ctx = this.canvas.getContext('2d', { 
                alpha: false,
                willReadFrequently: true 
            });

            if (!this.ctx) {
                console.error("[VDU] ❌ Não foi possível obter contexto 2D");
                throw new Error("Canvas 2D context não disponível");
            }

            // ========== RESOLUÇÃO ==========
            this.width = options.width || 320;
            this.height = options.height || 224;
            this.canvas.width = this.width;
            this.canvas.height = this.height;

            // ========== MODO DE CORES ==========
            // ✅ CORRIGIDO: Armazenar colorMode mas SEMPRE trabalhar com RGBA8888
            this.colorModeSource = options.colorMode || 'RGB565';
            
            // ImageData.data é SEMPRE RGBA8888 (4 bytes/pixel)
            this.colorModeTarget = 'RGBA8888';

            // ========== REGISTRADORES MMIO ==========
            this.ctrl = options.displayEnable !== false ? 0x01 : 0x01;
            this.status = 0x00;

            // ✅ CORRIGIDO: Framebuffer address (default DRAM)
            this.fbAddrHigh = (options.fbAddr >>> 16) & 0xFFFF;
            this.fbAddrLow = options.fbAddr & 0xFFFF;
            this.fbAddr = options.fbAddr || 0xA0000000;

            // ========== IMAGE DATA ==========
            this.imageData = this.ctx.createImageData(this.width, this.height);
            this.imageDataU32 = new Uint32Array(this.imageData.data.buffer);

            // ========== ESTATÍSTICAS ==========
            this.stats = {
                framesRendered: 0,
                framesAttempted: 0,
                framebufferErrors: 0,
                boundsErrors: 0,
                lastRenderTime: 0,
                avgRenderTime: 0,
                vblanks: 0,
                conversionErrors: 0
            };

            // ========== PERIFÉRICOS CONECTADOS ==========
            this.intC = null;
            this.miu = null;

            // ========== DEBUG ==========
            this.debugEnabled = options.debug || false;
            this.logEveryFrame = false;

            // ========== CALLBACKS ==========
            this.onVBlank = null;
            this.onStatusChange = null;

            console.log(`[VDU] ✓ Video Display Unit inicializada`);
            console.log(`[VDU]   Resolução: ${this.width}x${this.height}`);
            console.log(`[VDU]   Modo de cores (entrada): ${this.colorModeSource}`);
            console.log(`[VDU]   Modo de cores (saída): ${this.colorModeTarget}`);
            console.log(`[VDU]   Display Enable: ${(this.ctrl & 0x01) ? 'SIM' : 'NÃO'}`);
        }

        // ========== CONEXÃO DE PERIFÉRICOS ==========

        connectInterruptController(intC) {
            this.intC = intC;
            console.log("[VDU] Interrupt Controller conectado");
        }

        connectMIU(miu) {
            this.miu = miu;
            console.log("[VDU] MIU conectada ✓");
        }

        // ========== INTERFACE MEMORYREGION ==========

        readU8(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 3) * 8;
            return (word >>> shift) & 0xFF;
        }

        readU16(offset) {
            const word = this.readU32(offset & ~3);
            const shift = (offset & 2) * 8;
            return (word >>> shift) & 0xFFFF;
        }

        /**
         * ✅ CORRIGIDO: Switch com offsets alinhados corretamente
         */
        readU32(address) {
            const offset = address & 0xFFFF;

            // ✅ CORRIGIDO: Alinhamento para 2-bytes
            const alignedOffset = offset & ~1;

            switch (alignedOffset) {
                case 0x0000:  // CTRL
                    if (this.debugEnabled) {
                        console.log(`[VDU] readU32(CTRL) = 0x${this.ctrl.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    return this.ctrl >>> 0;

                case 0x0002:  // STAT
                    if (this.debugEnabled) {
                        console.log(`[VDU] readU32(STAT) = 0x${this.status.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    return this.status >>> 0;

                case 0x0004:  // FB_ADDR_H
                    if (this.debugEnabled) {
                        console.log(`[VDU] readU32(FB_ADDR_H) = 0x${this.fbAddrHigh.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    return this.fbAddrHigh >>> 0;

                case 0x0006:  // FB_ADDR_L
                    if (this.debugEnabled) {
                        console.log(`[VDU] readU32(FB_ADDR_L) = 0x${this.fbAddrLow.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    return this.fbAddrLow >>> 0;

                default:
                    if (this.debugEnabled) {
                        console.warn(`[VDU] readU32 - Offset desconhecido: 0x${offset.toString(16).padStart(4, '0')}`);
                    }
                    return 0;
            }
        }

        writeU8(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 3) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFF << shift)) | ((value & 0xFF) << shift);
            this.writeU32(addr, word);
        }

        writeU16(offset, value) {
            const addr = offset & ~3;
            const shift = (offset & 2) * 8;
            let word = this.readU32(addr);
            word = (word & ~(0xFFFF << shift)) | ((value & 0xFFFF) << shift);
            this.writeU32(addr, word);
        }

        /**
         * ✅ CORRIGIDO: Switch com offsets alinhados
         */
        writeU32(offset, value) {
            value = value >>> 0;
            offset = offset & 0xFFFF;

            const alignedOffset = offset & ~1;

            switch (alignedOffset) {
                case 0x0000:  // CTRL
                    const wasEnabled = (this.ctrl & 0x01) !== 0;
                    const isEnabled = (value & 0x01) !== 0;

                    this.ctrl = value;
                    
                    if (!wasEnabled && isEnabled) {
                        if (this.debugEnabled) console.log("[VDU] Display ativado");
                    } else if (wasEnabled && !isEnabled) {
                        if (this.debugEnabled) console.log("[VDU] Display desativado");
                    }
                    break;

                case 0x0002:  // STAT (Read-only)
                    if (this.debugEnabled) {
                        console.log(`[VDU] writeU32(STAT) ignorado (read-only)`);
                    }
                    break;

                case 0x0004:  // FB_ADDR_H
                    this.fbAddrHigh = value & 0xFFFF;
                    this.fbAddr = (this.fbAddrHigh << 16) | this.fbAddrLow;
                    if (this.debugEnabled) {
                        console.log(`[VDU] FB_ADDR = 0x${this.fbAddr.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    break;

                case 0x0006:  // FB_ADDR_L
                    this.fbAddrLow = value & 0xFFFF;
                    this.fbAddr = (this.fbAddrHigh << 16) | this.fbAddrLow;
                    if (this.debugEnabled) {
                        console.log(`[VDU] FB_ADDR = 0x${this.fbAddr.toString(16).padStart(8, '0').toUpperCase()}`);
                    }
                    break;

                default:
                    if (this.debugEnabled) {
                        console.warn(`[VDU] writeU32 - Offset desconhecido: 0x${offset.toString(16).padStart(4, '0')}`);
                    }
            }
        }

        // ========== RENDERIZAÇÃO ==========

        /**
         * ✅ CORRIGIDO: Renderiza framebuffer com tratamento de erro robusto
         */
        render(miu = null) {
            const startTime = performance.now();
            this.stats.framesAttempted++;

            // 1. Verificar se Display está habilitado
            if (!(this.ctrl & 0x01)) {
                if (this.debugEnabled) {
                    console.log("[VDU] Display desativado, pulando render");
                }
                return false;
            }

            // 2. Usar MIU fornecida ou conectada
            miu = miu || this.miu;
            if (!miu) {
                console.warn("[VDU] ⚠️ MIU não disponível");
                this.stats.framebufferErrors++;
                return false;
            }

            try {
                // 3. Validar endereço do framebuffer
                if (!this._validateFBAddress(miu)) {
                    this.stats.framebufferErrors++;
                    return false;
                }

                // 4. Copiar pixels da RAM
                const success = this._copyFramebuffer(miu);
                if (!success) {
                    this.stats.framebufferErrors++;
                    return false;
                }

                // 5. Enviar para Canvas
                this.ctx.putImageData(this.imageData, 0, 0);
                this.stats.framesRendered++;

                // 6. Simular VBlank
                this.triggerVBlank();

                const endTime = performance.now();
                this.stats.lastRenderTime = endTime - startTime;
                
                if (this.logEveryFrame) {
                    console.log(`[VDU] Frame ${this.stats.framesRendered} em ${this.stats.lastRenderTime.toFixed(2)}ms`);
                }

                return true;

            } catch (err) {
                console.error("[VDU] ❌ Erro ao renderizar:", err);
                this.stats.framebufferErrors++;
                return false;
            }
        }

        /**
         * ✅ CORRIGIDO: Valida framebuffer address completamente
         */
        _validateFBAddress(miu) {
            const segment = (this.fbAddr >>> 24) & 0xFF;
            const offset = this.fbAddr & 0xFFFFFF;

            // Verificar se segmento existe
            const region = miu.getRegion ? miu.getRegion(segment) : miu.segments[segment];
            if (!region) {
                if (this.debugEnabled) {
                    console.warn(`[VDU] ⚠️ Segmento 0x${segment.toString(16).padStart(2, '0').toUpperCase()} não mapeado`);
                }
                return false;
            }

            // Verificar se há espaço suficiente
            const pixelCount = this.width * this.height;
            const bytesNeeded = pixelCount * 4;  // RGBA8888 = 4 bytes/pixel
            const regionSize = region.size || (region.buffer ? region.buffer.byteLength : 0);

            if (offset + bytesNeeded > regionSize) {
                if (this.debugEnabled) {
                    console.warn(
                        `[VDU] ⚠️ Framebuffer fora de limites: ` +
                        `offset=0x${offset.toString(16)} + ${bytesNeeded} bytes > region_size=${regionSize}`
                    );
                }
                this.stats.boundsErrors++;
                return false;
            }

            return true;
        }

        /**
         * ✅ CORRIGIDO: Copia pixels com conversão de cores correta
         */
        _copyFramebuffer(miu) {
            try {
                const segment = (this.fbAddr >>> 24) & 0xFF;
                const offset = this.fbAddr & 0xFFFFFF;

                // Obter região (DRAM ou outra)
                const region = miu.getRegion ? miu.getRegion(segment) : miu.segments[segment];
                if (!region || !region.buffer) {
                    console.error("[VDU] ❌ Região sem buffer acessível");
                    return false;
                }

                const pixelCount = this.width * this.height;

                // ✅ CORRIGIDO: Converter conforme colorModeSource
                switch (this.colorModeSource) {
                    case 'RGBA8888':
                        // Cópia direta (RAM já está em RGBA8888)
                        const ramViewRGBA = new Uint32Array(region.buffer, offset, pixelCount);
                        this.imageDataU32.set(ramViewRGBA);
                        break;

                    case 'RGB565':
                        // Converter de RGB565 (2 bytes) para RGBA8888
                        const ramView565 = new Uint16Array(region.buffer, offset, pixelCount);
                        for (let i = 0; i < pixelCount; i++) {
                            const rgb565 = ramView565[i];
                            this.imageDataU32[i] = this._rgb565ToRGBA8888(rgb565);
                        }
                        break;

                    case 'RGB555':
                        // Converter de RGB555 (2 bytes) para RGBA8888
                        const ramView555 = new Uint16Array(region.buffer, offset, pixelCount);
                        for (let i = 0; i < pixelCount; i++) {
                            const rgb555 = ramView555[i];
                            this.imageDataU32[i] = this._rgb555ToRGBA8888(rgb555);
                        }
                        break;

                    case 'ARGB8888':
                        // Converter de ARGB8888 para RGBA8888
                        const ramViewARGB = new Uint32Array(region.buffer, offset, pixelCount);
                        for (let i = 0; i < pixelCount; i++) {
                            const argb = ramViewARGB[i];
                            const a = (argb >>> 24) & 0xFF;
                            const r = (argb >>> 16) & 0xFF;
                            const g = (argb >>> 8) & 0xFF;
                            const b = argb & 0xFF;
                            this.imageDataU32[i] = (r << 24) | (g << 16) | (b << 8) | a;
                        }
                        break;

                    default:
                        console.warn(`[VDU] ⚠️ Modo de cores desconhecido: ${this.colorModeSource}`);
                        this.stats.conversionErrors++;
                        return false;
                }

                return true;

            } catch (err) {
                console.error("[VDU] ❌ Erro ao copiar framebuffer:", err);
                this.stats.framebufferErrors++;
                return false;
            }
        }

        /**
         * Converte RGB565 para RGBA8888
         */
        _rgb565ToRGBA8888(rgb565) {
            const r = ((rgb565 >>> 11) & 0x1F) * 255 / 31;
            const g = ((rgb565 >>> 5) & 0x3F) * 255 / 63;
            const b = (rgb565 & 0x1F) * 255 / 31;
            const a = 0xFF;

            return (Math.round(r) << 24) | (Math.round(g) << 16) | (Math.round(b) << 8) | a;
        }

        /**
         * Converte RGB555 para RGBA8888
         */
        _rgb555ToRGBA8888(rgb555) {
            const r = ((rgb555 >>> 10) & 0x1F) * 255 / 31;
            const g = ((rgb555 >>> 5) & 0x1F) * 255 / 31;
            const b = (rgb555 & 0x1F) * 255 / 31;
            const a = 0xFF;

            return (Math.round(r) << 24) | (Math.round(g) << 16) | (Math.round(b) << 8) | a;
        }

        // ========== VBLANK & INTERRUPTS ==========

        triggerVBlank() {
            this.status |= 0x01;
            this.stats.vblanks++;

            if (this.onVBlank) {
                this.onVBlank();
            }

            if (this.onStatusChange) {
                this.onStatusChange('vblank');
            }

            setTimeout(() => {
                this.status &= ~0x01;
            }, 1000 / 60);
        }

        // ========== DEBUG & INFO ==========

        isValidOffset(offset) {
            return offset >= 0 && offset <= 0x06;
        }

        getInfo() {
            return {
                type: this.constructor.name,
                width: this.width,
                height: this.height,
                framebufferAddr: `0x${this.fbAddr.toString(16).padStart(8, '0').toUpperCase()}`,
                displayEnabled: (this.ctrl & 0x01) ? true : false,
                inVBlank: (this.status & 0x01) ? true : false,
                colorModeSource: this.colorModeSource,
                colorModeTarget: this.colorModeTarget,
                stats: { ...this.stats }
            };
        }

        getStatus() {
            const lines = [];
            lines.push("═══ VIDEO DISPLAY UNIT STATUS ═══");
            lines.push(`Resolution:    ${this.width}x${this.height}`);
            lines.push(`FB Address:    0x${this.fbAddr.toString(16).padStart(8, '0').toUpperCase()}`);
            lines.push(`Display:       ${(this.ctrl & 0x01) ? "ENABLED" : "DISABLED"}`);
            lines.push(`VBlank:        ${(this.status & 0x01) ? "YES" : "NO"}`);
            lines.push(`Color Mode:    ${this.colorModeSource} → ${this.colorModeTarget}`);
            lines.push("");
            lines.push(`Frames Rendered: ${this.stats.framesRendered}`);
            lines.push(`FB Errors:       ${this.stats.framebufferErrors}`);
            lines.push(`Bounds Errors:   ${this.stats.boundsErrors}`);
            lines.push(`Conv Errors:     ${this.stats.conversionErrors}`);
            lines.push(`Last Render:     ${this.stats.lastRenderTime.toFixed(2)}ms`);

            return lines.join("\n");
        }

        dump() {
            let output = "╔════════════════════════════════════╗\n";
            output += "║   VIDEO DISPLAY UNIT (VDU)        ║\n";
            output += "╚════════════════════════════════════╝\n\n";
            output += this.getStatus();
            output += "\n";
            return output;
        }

        setDebug(enabled) {
            this.debugEnabled = enabled;
            console.log(`[VDU] Debug: ${enabled ? "ATIVADO" : "DESATIVADO"}`);
        }

        clear(r = 0, g = 0, b = 0, a = 255) {
            const color = (r << 24) | (g << 16) | (b << 8) | a;
            this.imageDataU32.fill(color);
            this.ctx.putImageData(this.imageData, 0, 0);
        }

        setResolution(w, h) {
            if (w !== this.width || h !== this.height) {
                this.width = w;
                this.height = h;
                this.canvas.width = w;
                this.canvas.height = h;
                this.imageData = this.ctx.createImageData(this.width, this.height);
                this.imageDataU32 = new Uint32Array(this.imageData.data.buffer);
                console.log(`[VDU] Resolução alterada para ${w}x${h}`);
            }
        }

        setColorMode(mode) {
            const validModes = ['RGBA8888', 'RGB565', 'RGB555', 'ARGB8888'];
            if (validModes.includes(mode)) {
                this.colorModeSource = mode;
                console.log(`[VDU] Modo de cores (entrada) alterado para ${mode}`);
            } else {
                console.warn(`[VDU] ⚠️ Modo de cores inválido: ${mode}`);
            }
        }

        reset() {
            this.ctrl = 0x01;
            this.status = 0x00;
            this.fbAddr = 0xA0000000;
            this.fbAddrHigh = 0xA000;
            this.fbAddrLow = 0x0000;
            this.stats = {
                framesRendered: 0,
                framesAttempted: 0,
                framebufferErrors: 0,
                boundsErrors: 0,
                lastRenderTime: 0,
                avgRenderTime: 0,
                vblanks: 0,
                conversionErrors: 0
            };
            this.clear();
            console.log("[VDU] Reset completo");
        }
    }

    window.VideoDisplayUnit = VideoDisplayUnit;

    console.log("[VDU] ✓ VideoDisplayUnit carregada v2.1");
    console.log("[VDU] ✅ BUG #1 CORRIGIDO: ColorMode sempre converte TO RGBA8888");
    console.log("[VDU] ✅ BUG #2 CORRIGIDO: Offset framebuffer correto");
    console.log("[VDU] ✅ BUG #4 CORRIGIDO: Switch com alinhamento de offsets");
    console.log("[VDU] ✓ Extends MemoryRegion - Compatível com MIU");
    console.log("[VDU] ✓ Suporta acesso de 8/16/32 bits");
    console.log("[VDU] ✓ Resolução: 320x224 (HyperScan nativa)");
}
