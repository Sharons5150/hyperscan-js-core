# HyperScan JS-Core: A High-Performance Sunplus SPG290 Emulator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Engine: S+core RISC](https://img.shields.io/badge/Architecture-S+core%2032--bit-blue)]()
[![Platform: Web/JS](https://img.shields.io/badge/Platform-JavaScript%20ES6+-orange)]()

**HyperScan JS-Core** é uma implementação de baixo nível da arquitetura Sunplus SPG290, core do console Mattel HyperScan. O projeto visa a ciclo-precisão (cycle-accuracy) e fornece um ambiente de depuração robusto para engenharia reversa do set de instruções S+core.

---

## 🏗️ System Architecture

O emulador foi projetado seguindo o padrão de barramento desacoplado, onde a CPU interage com a memória através de uma **MIU (Memory Interface Unit)** abstrata.

### 1. CPU Core (S+core RISC)
* **ISA:** Implementação completa do set Sunplus S+core.
* **Pipeline:** Decodificação de instruções de comprimento variável (16-bit e 32-bit).
* **Exception Handling:** Gerenciamento de traps de sistema e estados de interrupção.
* **Registers:** Simulação fiel dos 32 GPRs, SRs e registradores de controle.

### 2. Memory Subsystem (MIU)
Utilizamos `TypedArrays` para garantir performance de acesso quase nativa (JIT-optimized).
* **Segmented Mapping:** 256 segmentos de 16MB cada.
* **DRAM:** 16MB mapeados em `0xA0000000`.
* **Flash ROM:** 8MB mapeados em `0x9E000000`.
* **I/O Ports:** Memory-mapped I/O (MMIO) no segmento `0x08`.

### 3. Graphics & Peripherals
* **VDU (Video Display Unit):** Motor de renderização com suporte a buffers RGB565/RGBA8888 e simulação de V-Blank.
* **INTC:** Controlador de interrupções de 32 bits com suporte a priorização.
* **UART:** Interface full-duplex para debugging serial.

---

## 🛠️ Developer Tools: Luna Console

A **Luna Console** é o coração do ambiente de desenvolvimento deste emulador, permitindo:

- **Hot-Swapping:** Alteração de valores em registradores em tempo real.
- **Cycle Stepping:** Execução granular instrução por instrução para análise de pipeline.
- **Trace Engine:** Logging detalhado de saltos (`JMP`) e chamadas de sub-rotinas (`CALL`).
- **Memory Dump:** Inspeção de memória via hex-view com tradução ASCII.

---

## 🚀 Getting Started

### Pré-requisitos
* Um navegador moderno com suporte a **ES6 Modules**.
* Um servidor HTTP local (devido às políticas de CORS para carregamento de módulos).

### Instalação e Execução
1. Clone o repositório:
   ```bash
   git clone [https://github.com/Ccor444/hyperscan-js-core.git](https://github.com/Ccor444/hyperscan-js-core.git)
   
