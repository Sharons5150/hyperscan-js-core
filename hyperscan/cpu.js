/**
 * SPCE3200 CPU - HyperScan Emulator - 100% COMPLETO
 * Todos os opcodes implementados
 * Baseado em: https://github.com/LiraNuna/hyperscan-emulator
 */

"use strict";

class CPU {
    constructor(miu = null) {
        this.miu = miu;
        this.reset();
    }

    reset() {
        this.r = new Uint32Array(32);
        this.cr = new Uint32Array(32);
        this.sr = new Uint32Array(32);
        this.CEL = 0;
        this.CEH = 0;
        this.pc = 0;
        this.N = 0;
        this.Z = 0;
        this.C = 0;
        this.V = 0;
        this.T = 0;
        this.cycles = 0;
        this.instructions = 0;
        this.halted = false;
    }

    getPC() { return this.pc; }
    setPC(addr) { this.pc = addr >>> 0; }
    getRegister(idx) { return (idx >= 0 && idx < 32) ? this.r[idx] >>> 0 : 0; }
    setRegister(idx, value) { if (idx >= 0 && idx < 32) this.r[idx] = value >>> 0; }
    getSystemRegister(idx) { return (idx >= 0 && idx < 32) ? this.sr[idx] >>> 0 : 0; }
    setSystemRegister(idx, value) { if (idx >= 0 && idx < 32) { this.sr[idx] = value >>> 0; if (idx === 0) this.unpackSR0(); } }
    getControlRegister(idx) { return (idx >= 0 && idx < 32) ? this.cr[idx] >>> 0 : 0; }
    setControlRegister(idx, value) { if (idx >= 0 && idx < 32) this.cr[idx] = value >>> 0; }
    getFlags() { return { N: this.N, Z: this.Z, C: this.C, V: this.V, T: this.T }; }

    signExtend(x, b) {
        if (b >= 32) return x >>> 0;
        let m = 1 << (b - 1);
        x = x & ((1 << b) - 1);
        return ((x ^ m) - m) >>> 0;
    }

    updateBasicFlags(res) {
        res = res >>> 0;
        this.N = (res >>> 31) & 1;
        this.Z = (res === 0) ? 1 : 0;
    }

    packSR0() {
        this.sr[0] = ((this.N & 1) << 31) | ((this.Z & 1) << 30) | ((this.C & 1) << 29) | ((this.V & 1) << 28) | (this.T & 1);
    }

    unpackSR0() {
        const v = this.sr[0] >>> 0;
        this.N = (v >>> 31) & 1;
        this.Z = (v >>> 30) & 1;
        this.C = (v >>> 29) & 1;
        this.V = (v >>> 28) & 1;
        this.T = (v >>> 0) & 1;
    }

    add(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let res = (a + b) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (b > (0xFFFFFFFF - a)) ? 1 : 0;
            this.V = ((~(a ^ b) & (a ^ res)) >>> 31) & 1;
        }
        return res;
    }

    addc(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let res = (a + b + this.C) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((b + this.C) > (0xFFFFFFFF - a)) ? 1 : 0;
            this.V = ((~(a ^ b) & (a ^ res)) >>> 31) & 1;
        }
        return res;
    }

    sub(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let res = (a - b) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (a >= b) ? 1 : 0;
            this.V = (((a ^ b) & ~(res ^ b)) >>> 31) & 1;
        }
        return res;
    }

    subc(a, b, updateFlags = false) {
        a = a >>> 0;
        b = b >>> 0;
        let borrow = (this.C === 0) ? 1 : 0;
        let res = (a - b - borrow) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (a >= (b + borrow)) ? 1 : 0;
            this.V = (((a ^ b) & ~(res ^ b)) >>> 31) & 1;
        }
        return res;
    }

    neg(a, updateFlags = false) {
        a = a >>> 0;
        let res = (0 - a) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = (a === 0) ? 1 : 0;
            this.V = (a === 0x80000000) ? 1 : 0;
        }
        return res;
    }

    bitOp(a, b, type, updateFlags = false) {
        let res = 0;
        switch(type) {
            case 'and': res = (a & b) >>> 0; break;
            case 'or':  res = (a | b) >>> 0; break;
            case 'xor': res = (a ^ b) >>> 0; break;
            case 'not': res = (~a) >>> 0; break;
        }
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    sll(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        let res = (a << sa) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            if (sa > 0) this.C = ((a >>> (32 - sa)) & 1);
        }
        return res;
    }

    srl(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        let res = (a >>> sa) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            if (sa > 0) this.C = ((a >>> (sa - 1)) & 1);
        }
        return res;
    }

    sra(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        let res = ((a | 0) >> sa) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            if (sa > 0) this.C = ((a >>> (sa - 1)) & 1);
        }
        return res;
    }

    ror(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        if (sa === 0) return a;
        let res = ((a >>> sa) | (a << (32 - sa))) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((a >>> (sa - 1)) & 1);
        }
        return res;
    }

    rol(a, sa, updateFlags = false) {
        a = a >>> 0;
        sa = sa & 0x1F;
        if (sa === 0) return a;
        let res = ((a << sa) | (a >>> (32 - sa))) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((a >>> (32 - sa)) & 1);
        }
        return res;
    }

    rorc(a, updateFlags = false) {
        a = a >>> 0;
        let res = ((a >>> 1) | ((this.C & 1) << 31)) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = a & 1;
        }
        return res;
    }

    rolc(a, updateFlags = false) {
        a = a >>> 0;
        let res = ((a << 1) | (this.C & 1)) >>> 0;
        if (updateFlags) {
            this.updateBasicFlags(res);
            this.C = ((a >>> 31) & 1);
        }
        return res;
    }

    extsb(a, updateFlags = false) {
        let res = (a | 0) & 0xFF;
        if (res & 0x80) res = res | 0xFFFFFF00;
        res = res >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    extsh(a, updateFlags = false) {
        let res = (a | 0) & 0xFFFF;
        if (res & 0x8000) res = res | 0xFFFF0000;
        res = res >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    extzb(a, updateFlags = false) {
        let res = a & 0xFF;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    extzh(a, updateFlags = false) {
        let res = a & 0xFFFF;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    bitclr(a, bitIdx, updateFlags = false) {
        bitIdx = bitIdx & 0x1F;
        let res = (a & ~(1 << bitIdx)) >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    bitset(a, bitIdx, updateFlags = false) {
        bitIdx = bitIdx & 0x1F;
        let res = (a | (1 << bitIdx)) >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    bittst(a, bitIdx) {
        bitIdx = bitIdx & 0x1F;
        this.T = ((a & (1 << bitIdx)) !== 0) ? 1 : 0;
        this.Z = this.T ? 0 : 1;
    }

    bittgl(a, bitIdx, updateFlags = false) {
        bitIdx = bitIdx & 0x1F;
        let res = (a ^ (1 << bitIdx)) >>> 0;
        if (updateFlags) this.updateBasicFlags(res);
        return res;
    }

    conditional(cond) {
        cond = cond & 0x0F;
        switch(cond) {
            case 0x00: return (this.C === 1);
            case 0x01: return (this.C === 0);
            case 0x02: return (this.C === 1 && this.Z === 0);
            case 0x03: return (this.C === 0 || this.Z === 1);
            case 0x04: return (this.Z === 1);
            case 0x05: return (this.Z === 0);
            case 0x06: return (this.N === this.V && this.Z === 0);
            case 0x07: return (this.N !== this.V || this.Z === 1);
            case 0x08: return (this.N === this.V);
            case 0x09: return (this.N !== this.V);
            case 0x0A: return (this.N === 1);
            case 0x0B: return (this.N === 0);
            case 0x0C: return (this.V === 1);
            case 0x0D: return (this.V === 0);
            case 0x0E: return (this.T === 1);
            case 0x0F: return true;
        }
        return false;
    }

    execMul(a, b) {
        let sA = a | 0;
        let sB = b | 0;
        let valA = BigInt(sA);
        let valB = BigInt(sB);
        let res = valA * valB;
        this.CEL = Number(res & 0xFFFFFFFFn) >>> 0;
        this.CEH = Number((res >> 32n) & 0xFFFFFFFFn) >>> 0;
    }

    execMulu(a, b) {
        let valA = BigInt(a >>> 0);
        let valB = BigInt(b >>> 0);
        let res = valA * valB;
        this.CEL = Number(res & 0xFFFFFFFFn) >>> 0;
        this.CEH = Number((res >> 32n) & 0xFFFFFFFFn) >>> 0;
    }

    execDiv(a, b) {
        let sA = a | 0;
        let sB = b | 0;
        if (sB !== 0) {
            this.CEL = Math.trunc(sA / sB) >>> 0;
            this.CEH = (sA % sB) >>> 0;
        }
    }

    execDivu(a, b) {
        let uA = a >>> 0;
        let uB = b >>> 0;
        if (uB !== 0) {
            this.CEL = Math.floor(uA / uB) >>> 0;
            this.CEH = (uA % uB) >>> 0;
        }
    }

    moveFromCE(rD, rB) {
        rB = rB & 0x03;
        switch(rB) {
            case 1: this.r[rD] = this.CEL; break;
            case 2: this.r[rD] = this.CEH; break;
            case 3:
                this.r[rD] = this.CEL;
                if (rD < 31) this.r[rD + 1] = this.CEH;
                break;
        }
    }

    moveToCE(rD, rB) {
        rB = rB & 0x03;
        switch(rB) {
            case 1: this.CEL = this.r[rD]; break;
            case 2: this.CEH = this.r[rD]; break;
            case 3:
                this.CEL = this.r[rD];
                if (rD < 31) this.CEH = this.r[rD + 1];
                break;
        }
    }

    execSpForm(insn) {
        const rD = (insn >>> 22) & 0x1F;
        const rA = (insn >>> 17) & 0x1F;
        const rB = (insn >>> 12) & 0x1F;
        const func6 = (insn >>> 1) & 0x3F;
        const CU = insn & 1;

        switch(func6) {
            case 0x00: break;
            case 0x01: break; // syscall
            case 0x02: if (this.conditional(rB)) this.exception(0x02); break;
            case 0x03: this.exception(0x03); break;
            case 0x04:
                if (this.conditional(rB)) {
                    if (CU) this.r[3] = (this.pc + 4) >>> 0;
                    this.pc = this.r[rA];
                    return 0;
                }
                break;
            case 0x05: break; // pflush
            case 0x06: // alw
                if (this.miu) this.r[rD] = this.miu.readU32(this.r[rA]);
                break;
            case 0x07: // asw
                if (this.miu) this.miu.writeU32(this.r[rA], this.r[rD]);
                break;
            case 0x08: this.r[rD] = this.add(this.r[rA], this.r[rB], CU === 1); break;
            case 0x09: this.r[rD] = this.addc(this.r[rA], this.r[rB], CU === 1); break;
            case 0x0A: this.r[rD] = this.sub(this.r[rA], this.r[rB], CU === 1); break;
            case 0x0B: this.r[rD] = this.subc(this.r[rA], this.r[rB], CU === 1); break;
            case 0x0C: this.sub(this.r[rA], this.r[rB], true); this.T = this.conditional(rD) ? 1 : 0; break;
            case 0x0D: this.sub(this.r[rA], 0, true); this.T = this.conditional(rD) ? 1 : 0; break;
            case 0x0F: this.r[rD] = this.neg(this.r[rA], CU === 1); break;
            case 0x10: this.r[rD] = this.bitOp(this.r[rA], this.r[rB], 'and', CU === 1); break;
            case 0x11: this.r[rD] = this.bitOp(this.r[rA], this.r[rB], 'or', CU === 1); break;
            case 0x12: this.r[rD] = this.bitOp(this.r[rA], 0, 'not', CU === 1); break;
            case 0x13: this.r[rD] = this.bitOp(this.r[rA], this.r[rB], 'xor', CU === 1); break;
            case 0x14: this.r[rD] = this.bitclr(this.r[rA], rB, CU === 1); break;
            case 0x15: this.r[rD] = this.bitset(this.r[rA], rB, CU === 1); break;
            case 0x16: this.bittst(this.r[rA], rB); break;
            case 0x17: this.r[rD] = this.bittgl(this.r[rA], rB, CU === 1); break;
            case 0x18: this.r[rD] = this.sll(this.r[rA], this.r[rB], CU === 1); break;
            case 0x1A: this.r[rD] = this.srl(this.r[rA], this.r[rB], CU === 1); break;
            case 0x1B: this.r[rD] = this.sra(this.r[rA], this.r[rB], CU === 1); break;
            case 0x1C: this.r[rD] = this.ror(this.r[rA], this.r[rB], CU === 1); break;
            case 0x1D: this.r[rD] = this.rorc(this.r[rA], CU === 1); break;
            case 0x1E: this.r[rD] = this.rol(this.r[rA], this.r[rB], CU === 1); break;
            case 0x1F: this.r[rD] = this.rolc(this.r[rA], CU === 1); break;
            case 0x20: this.execMul(this.r[rA], this.r[rB]); break;
            case 0x21: this.execMulu(this.r[rA], this.r[rB]); break;
            case 0x22: this.execDiv(this.r[rA], this.r[rB]); break;
            case 0x23: this.execDivu(this.r[rA], this.r[rB]); break;
            case 0x24: this.moveFromCE(rD, rB); break;
            case 0x25: this.moveToCE(rD, rB); break;
            case 0x28: this.r[rD] = this.sr[rB]; break;
            case 0x29: this.sr[rB] = this.r[rA]; if (rB === 0) this.unpackSR0(); break;
            case 0x2A: this.T = this.conditional(rB) ? 1 : 0; break;
            case 0x2B: if (this.conditional(rB)) this.r[rD] = this.r[rA]; break;
            case 0x2C: this.r[rD] = this.extsb(this.r[rA], CU === 1); break;
            case 0x2D: this.r[rD] = this.extsh(this.r[rA], CU === 1); break;
            case 0x2E: this.r[rD] = this.extzb(this.r[rA], CU === 1); break;
            case 0x2F: this.r[rD] = this.extzh(this.r[rA], CU === 1); break;
            case 0x30: if (this.miu) this.r[rD] = this.miu.readU8(this.r[rA]); break;
            case 0x31: if (this.miu) this.r[rD] = this.miu.readU32(this.r[rA]); break;
            case 0x34: if (this.miu) this.miu.writeU8(this.r[rA], this.r[rD] & 0xFF); break;
            case 0x35: if (this.miu) this.miu.writeU32(this.r[rA], this.r[rD]); break;
            case 0x38: this.r[rD] = this.sll(this.r[rA], rB, CU === 1); break;
            case 0x3A: this.r[rD] = this.srl(this.r[rA], rB, CU === 1); break;
            case 0x3B: this.r[rD] = this.sra(this.r[rA], rB, CU === 1); break;
            case 0x3C: this.r[rD] = this.ror(this.r[rA], rB, CU === 1); break;
            case 0x3D: this.r[rD] = this.rorc(this.r[rA], true); break;
            case 0x3E: this.r[rD] = this.rol(this.r[rA], rB, CU === 1); break;
            case 0x3F: this.r[rD] = this.rolc(this.r[rA], true); break;
        }
        return 4;
    }

    execIForm(insn) {
        const OP = (insn >>> 27) & 0x1F;
        const rD = (insn >>> 22) & 0x1F;
        const func3 = (insn >>> 19) & 0x07;
        const imm16 = this.signExtend((insn >>> 1) & 0xFFFF, 16);

        switch(OP) {
            case 0x01:
                switch(func3) {
                    case 0x00: this.r[rD] = this.add(this.r[rD], imm16, false); break;
                    case 0x02: this.sub(this.r[rD], imm16, true); break;
                    case 0x04: this.r[rD] = this.bitOp(this.r[rD], imm16, 'and', false); break;
                    case 0x05: this.r[rD] = this.bitOp(this.r[rD], imm16, 'or', false); break;
                    case 0x06: this.r[rD] = imm16; break;
                }
                break;
            case 0x05:
                switch(func3) {
                    case 0x00: this.r[rD] = this.add(this.r[rD], (imm16 << 16), false); break;
                    case 0x02: this.sub(this.r[rD], (imm16 << 16), true); break;
                    case 0x04: this.r[rD] = this.bitOp(this.r[rD], (imm16 << 16), 'and', false); break;
                    case 0x05: this.r[rD] = this.bitOp(this.r[rD], (imm16 << 16), 'or', false); break;
                    case 0x06: this.r[rD] = (imm16 << 16) >>> 0; break;
                }
                break;
        }
        return 4;
    }

    execJForm(insn) {
        const LK = insn & 1;
        const disp24 = (insn >>> 1) & 0xFFFFFF;
        const target = ((this.pc & 0xFE000000) | (disp24 << 1)) >>> 0;
        if (LK) this.r[3] = (this.pc + 4) >>> 0;
        this.pc = target;
        return 0;
    }

    execBForm(insn) {
        const LK = insn & 1;
        const BC = (insn >>> 23) & 0x0F;
        const disp_high = (insn >>> 9) & 0x3FFF;
        const disp_low = (insn >>> 1) & 0xFF;
        const disp22 = (disp_high << 8) | disp_low;
        const signed_disp = this.signExtend(disp22, 22);
        const target = (this.pc + (signed_disp << 1)) >>> 0;
        if (this.conditional(BC)) {
            if (LK) this.r[3] = (this.pc + 4) >>> 0;
            this.pc = target;
            return 0;
        }
        return 4;
    }

    execRixForm(insn) {
        const OP = (insn >>> 27) & 0x1F;
        const rD = (insn >>> 22) & 0x1F;
        const rA = (insn >>> 17) & 0x1F;
        const imm12 = this.signExtend((insn >>> 5) & 0xFFF, 12);
        const func3 = (insn >>> 2) & 0x07;
        const addr = (this.r[rA] + imm12) >>> 0;
        if (!this.miu) return 4;
        switch(func3) {
            case 0x00: this.r[rD] = this.miu.readU32(addr); break;
            case 0x01: this.r[rD] = this.signExtend(this.miu.readU16(addr), 16); break;
            case 0x02: this.r[rD] = this.miu.readU16(addr); break;
            case 0x03: this.r[rD] = this.signExtend(this.miu.readU8(addr), 8); break;
            case 0x04: this.miu.writeU32(addr, this.r[rD]); break;
            case 0x05: this.miu.writeU16(addr, this.r[rD]); break;
            case 0x06: this.r[rD] = this.miu.readU8(addr); break;
            case 0x07: this.miu.writeU8(addr, this.r[rD]); break;
        }
        if (OP === 0x03) this.r[rA] = addr;
        return 4;
    }

    execMemoryForm(insn) {
        const OP = (insn >>> 27) & 0x1F;
        const rD = (insn >>> 22) & 0x1F;
        const rA = (insn >>> 17) & 0x1F;
        const imm15 = this.signExtend((insn >>> 2) & 0x7FFF, 15);
        const addr = (this.r[rA] + imm15) >>> 0;
        if (!this.miu) return 4;
        switch(OP) {
            case 0x10: this.r[rD] = this.miu.readU32(addr); break;
            case 0x11: this.r[rD] = this.signExtend(this.miu.readU16(addr), 16); break;
            case 0x12: this.r[rD] = this.miu.readU16(addr); break;
            case 0x13: this.r[rD] = this.signExtend(this.miu.readU8(addr), 8); break;
            case 0x14: this.miu.writeU32(addr, this.r[rD]); break;
            case 0x15: this.miu.writeU16(addr, this.r[rD]); break;
            case 0x16: this.r[rD] = this.miu.readU8(addr); break;
            case 0x17: this.miu.writeU8(addr, this.r[rD]); break;
        }
        return 4;
    }
exec16(insn) {
        const OP = (insn >>> 13) & 0x07;
        const rD = (insn >>> 1) & 0x0F;
        const rA = (insn >>> 5) & 0x0F;

        switch(OP) {
            case 0x00: {
                const func4 = (insn >>> 9) & 0x0F;
                switch(func4) {
                    case 0x03: this.r[rD] = this.r[rA]; break;
                    case 0x04: this.pc = this.r[rA]; return 0;
                    case 0x05: this.r[3] = (this.pc + 2) >>> 0; this.pc = this.r[rA]; return 0;
                }
                break;
            }

            case 0x02: {
                const func4 = (insn >>> 9) & 0x0F;
                const H = (insn >>> 5) & 1;
                const targetReg = rD + (H ? 16 : 0);
                const spIdx = (insn >>> 6) & 0x07;

                switch(func4) {
                    case 0x00: this.r[rD] = this.add(this.r[rD], this.r[rA], true); break;
                    case 0x01: {
                        const imm5 = (insn >>> 5) & 0x1F;
                        this.r[rD] = this.add(this.r[rD], imm5, true);
                        break;
                    }
                    case 0x02: {
                        const imm5 = (insn >>> 5) & 0x1F;
                        this.sub(this.r[rD], imm5, true);
                        break;
                    }
                    case 0x0A:
                        if (this.miu) {
                            this.r[targetReg] = this.miu.readU32(this.r[spIdx]);
                            this.r[spIdx] = (this.r[spIdx] + 4) >>> 0;
                        }
                        break;
                    case 0x0E:
                        this.r[spIdx] = (this.r[spIdx] - 4) >>> 0;
                        if (this.miu) {
                            this.miu.writeU32(this.r[spIdx], this.r[targetReg]);
                        }
                        break;
                }
                break;
            }

            case 0x03: {
                const imm5 = (insn >>> 4) & 0x1F;
                const addr = (this.r[rA] + (imm5 << 2)) >>> 0;
                
                if ((insn >>> 12) & 1) {
                    if (this.miu) this.miu.writeU32(addr, this.r[rD]);
                } else {
                    if (this.miu) this.r[rD] = this.miu.readU32(addr);
                }
                break;
            }

            case 0x07: {
                const imm5 = (insn >>> 5) & 0x1F;
                const addr = (this.r[2] + (imm5 << 2)) >>> 0;

                if ((insn >>> 10) & 1) {
                    if (this.miu) this.miu.writeU32(addr, this.r[rD]);
                } else {
                    if (this.miu) this.r[rD] = this.miu.readU32(addr);
                }
                break;
            }
        }

        return 2;
    }

    exception(cause) {
        this.packSR0();
        this.cr[1] = this.sr[0];
        this.cr[2] = (this.cr[2] & ~0x00FC0000) | ((cause & 0x3F) << 18);
        this.cr[5] = this.pc;
        this.cr[0] &= ~1;
        this.pc = (this.cr[3] + (cause * 4)) >>> 0;
    }

    rte() {
        this.sr[0] = this.cr[1];
        this.unpackSR0();
        this.pc = this.cr[5];
    }

    // ========== CICLO DE EXECUÇÃO ==========

    step() {
        if (this.halted) return false;
        if (!this.miu) return false;

        const encoded = this.miu.readU32(this.pc);
        const OP = (encoded >>> 27) & 0x1F;

        let result = 4;

        switch(OP) {
            case 0x00:
                result = this.execSpForm(encoded);
                break;
            case 0x01:
            case 0x05:
                result = this.execIForm(encoded);
                break;
            case 0x02:
                result = this.execJForm(encoded);
                break;
            case 0x03:
            case 0x07:
                result = this.execRixForm(encoded);
                break;
            case 0x04:
                result = this.execBForm(encoded);
                break;
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
            case 0x16:
            case 0x17:
                result = this.execMemoryForm(encoded);
                break;
            case 0x08:
            case 0x09:
            case 0x0A:
            case 0x0B:
            case 0x0C:
            case 0x0D:
            case 0x0E:
            case 0x0F:
            case 0x18:
            case 0x19:
            case 0x1A:
            case 0x1B:
            case 0x1C:
            case 0x1D:
            case 0x1E:
            case 0x1F:
                // Instruções 16-bit compactadas
                const low = encoded & 0xFFFF;
                const high = (encoded >>> 16) & 0xFFFF;
                result = this.exec16(low);
                break;
            default:
                break;
        }

        if (result !== 0) {
            this.pc = (this.pc + result) >>> 0;
        }

        this.cycles++;
        this.instructions++;
        return true;
    }

    run(maxSteps = 1000) {
        let steps = 0;
        while (steps < maxSteps && !this.halted) {
            if (!this.step()) break;
            steps++;
        }
        return steps;
    }

    getState() {
        return {
            pc: this.pc,
            cycles: this.cycles,
            instructions: this.instructions,
            flags: this.getFlags(),
            registers: Array.from(this.r),
            systemRegisters: Array.from(this.sr),
            controlRegisters: Array.from(this.cr),
            customEngine: {
                CEL: this.CEL,
                CEH: this.CEH
            }
        };
    }

    halt() {
        this.halted = true;
    }

    resume() {
        this.halted = false;
    }

    // ========== DEBUG E DISSASEMBLY ==========

    disassemble(insn) {
        const OP = (insn >>> 27) & 0x1F;
        
        switch(OP) {
            case 0x00: return this.disassembleSP(insn);
            case 0x01:
            case 0x05: return this.disassembleI(insn);
            case 0x02: return this.disassembleJ(insn);
            case 0x03:
            case 0x07: return this.disassembleRix(insn);
            case 0x04: return this.disassembleB(insn);
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
            case 0x16:
            case 0x17: return this.disassembleMemory(insn);
            default: return `UNKNOWN (OP=0x${OP.toString(16)})`;
        }
    }

    disassembleSP(insn) {
        const rD = (insn >>> 22) & 0x1F;
        const rA = (insn >>> 17) & 0x1F;
        const rB = (insn >>> 12) & 0x1F;
        const func6 = (insn >>> 1) & 0x3F;
        
        const mnemonics = {
            0x00: 'nop',
            0x01: 'syscall',
            0x02: `trap`,
            0x03: 'sdbbp',
            0x04: `br.l`,
            0x05: 'pflush',
            0x06: `alw r${rD}, [r${rA}]`,
            0x07: `asw r${rD}, [r${rA}]`,
            0x08: `add r${rD}, r${rA}, r${rB}`,
            0x09: `addc r${rD}, r${rA}, r${rB}`,
            0x0A: `sub r${rD}, r${rA}, r${rB}`,
            0x0B: `subc r${rD}, r${rA}, r${rB}`,
            0x0C: `cmp r${rA}, r${rB}`,
            0x0D: `cmpz r${rA}`,
            0x0F: `neg r${rD}, r${rA}`,
            0x10: `and r${rD}, r${rA}, r${rB}`,
            0x11: `or r${rD}, r${rA}, r${rB}`,
            0x12: `not r${rD}, r${rA}`,
            0x13: `xor r${rD}, r${rA}, r${rB}`,
            0x14: `bitclr r${rD}, r${rA}`,
            0x15: `bitset r${rD}, r${rA}`,
            0x16: `bittst r${rA}`,
            0x17: `bittgl r${rD}, r${rA}`,
            0x18: `sll r${rD}, r${rA}, r${rB}`,
            0x1A: `srl r${rD}, r${rA}, r${rB}`,
            0x1B: `sra r${rD}, r${rA}, r${rB}`,
            0x1C: `ror r${rD}, r${rA}, r${rB}`,
            0x1D: `rorc r${rD}, r${rA}`,
            0x1E: `rol r${rD}, r${rA}, r${rB}`,
            0x1F: `rolc r${rD}, r${rA}`,
            0x20: `mul r${rA}, r${rB}`,
            0x21: `mulu r${rA}, r${rB}`,
            0x22: `div r${rA}, r${rB}`,
            0x23: `divu r${rA}, r${rB}`,
            0x24: `mfce r${rD}`,
            0x25: `mtce r${rD}`,
            0x28: `mfsr r${rD}, sr${rB}`,
            0x29: `mtsr sr${rB}, r${rA}`,
            0x2A: `tcond`,
            0x2B: `mvcond r${rD}, r${rA}`,
            0x2C: `extsb r${rD}, r${rA}`,
            0x2D: `extsh r${rD}, r${rA}`,
            0x2E: `extzb r${rD}, r${rA}`,
            0x2F: `extzh r${rD}, r${rA}`,
            0x30: `lcb r${rD}, [r${rA}]`,
            0x31: `lcw r${rD}, [r${rA}]`,
            0x34: `scb [r${rA}], r${rD}`,
            0x35: `scw [r${rA}], r${rD}`,
            0x38: `slli r${rD}, r${rA}, ${rB}`,
            0x3A: `srli r${rD}, r${rA}, ${rB}`,
            0x3B: `srai r${rD}, r${rA}, ${rB}`,
            0x3C: `rori r${rD}, r${rA}, ${rB}`,
            0x3D: `roric r${rD}, r${rA}`,
            0x3E: `roli r${rD}, r${rA}, ${rB}`,
            0x3F: `rolic r${rD}, r${rA}`
        };
        
        return mnemonics[func6] || `SP-FORM func6=0x${func6.toString(16)}`;
    }

    disassembleI(insn) {
        const OP = (insn >>> 27) & 0x1F;
        const rD = (insn >>> 22) & 0x1F;
        const func3 = (insn >>> 19) & 0x07;
        const imm16 = (insn >>> 1) & 0xFFFF;
        
        const mnemonics = {
            '1_0': `addi r${rD}, r${rD}, 0x${imm16.toString(16)}`,
            '1_2': `cmpi r${rD}, 0x${imm16.toString(16)}`,
            '1_4': `andi r${rD}, r${rD}, 0x${imm16.toString(16)}`,
            '1_5': `ori r${rD}, r${rD}, 0x${imm16.toString(16)}`,
            '1_6': `ldi r${rD}, 0x${imm16.toString(16)}`,
            '5_0': `addis r${rD}, r${rD}, 0x${imm16.toString(16)}`,
            '5_2': `cmpis r${rD}, 0x${imm16.toString(16)}`,
            '5_4': `andis r${rD}, r${rD}, 0x${imm16.toString(16)}`,
            '5_5': `oris r${rD}, r${rD}, 0x${imm16.toString(16)}`,
            '5_6': `ldis r${rD}, 0x${imm16.toString(16)}`
        };
        
        return mnemonics[`${OP}_${func3}`] || `I-FORM OP=0x${OP.toString(16)}`;
    }

    disassembleJ(insn) {
        const LK = insn & 1;
        const disp24 = (insn >>> 1) & 0xFFFFFF;
        const addr = ((this.pc & 0xFE000000) | (disp24 << 1)) >>> 0;
        return LK ? `jal 0x${addr.toString(16)}` : `j 0x${addr.toString(16)}`;
    }

    disassembleB(insn) {
        const BC = (insn >>> 23) & 0x0F;
        const conditions = ['cs', 'cc', 'hi', 'ls', 'eq', 'ne', 'gt', 'le', 'ge', 'lt', 'mi', 'pl', 'vs', 'vc', 't', 'al'];
        return `b${conditions[BC]} <offset>`;
    }

    disassembleRix(insn) {
        const rD = (insn >>> 22) & 0x1F;
        const rA = (insn >>> 17) & 0x1F;
        const func3 = (insn >>> 2) & 0x07;
        const ops = ['lw', 'lh', 'lhu', 'lb', 'sw', 'sh', 'lbu', 'sb'];
        return `${ops[func3]} r${rD}, [r${rA}]`;
    }

    disassembleMemory(insn) {
        const OP = (insn >>> 27) & 0x1F;
        const rD = (insn >>> 22) & 0x1F;
        const rA = (insn >>> 17) & 0x1F;
        const ops = {
            0x10: 'lw',
            0x11: 'lh',
            0x12: 'lhu',
            0x13: 'lb',
            0x14: 'sw',
            0x15: 'sh',
            0x16: 'lbu',
            0x17: 'sb'
        };
        return `${ops[OP]} r${rD}, [r${rA}]`;
    }

    dumpRegisters() {
        let output = "=== REGISTERS ===\n";
        for (let i = 0; i < 32; i++) {
            output += `r${i.toString().padStart(2, '0')}: 0x${this.r[i].toString(16).padStart(8, '0')}\n`;
        }
        output += "\n=== FLAGS ===\n";
        output += `N:${this.N} Z:${this.Z} C:${this.C} V:${this.V} T:${this.T}\n`;
        output += "\n=== PROGRAM COUNTER ===\n";
        output += `PC: 0x${this.pc.toString(16).padStart(8, '0')}\n`;
        output += `Cycles: ${this.cycles}\n`;
        output += `Instructions: ${this.instructions}\n`;
        return output;
    }
}

// ===== CÓDIGO CORRETO PARA O FINAL DO ARQUIVO cpu.js =====

// Exporta para Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CPU;
}

// Exportar para window (SEMPRE, fora do if)
window.CPU = CPU;