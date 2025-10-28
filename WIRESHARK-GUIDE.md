# 🔍 GUIA COMPLETO: WIRESHARK + USBPcap PARA SKYCAM

## 📋 OBJETIVO

Este guia ensina como usar **Wireshark + USBPcap** para capturar e analisar o tráfego USB real da sua **SkyCam Slim**, permitindo descobrir os comandos exatos que efetivamente controlam o hardware.

---

## 🎯 CENÁRIO TÍPICO

Você tem os logs mostrando que os comandos retornam **STATUS OK**, mas o **flash não muda** e o **foco é apenas simulado**. A causa mais comum é que os **parâmetros USB não são exatamente os corretos**.

### ❓ Por que isso acontece?

1. **wIndex incorreto** - Interface ou unidade errada
2. **wValue específico** - Valores magic numbers únicos do fabricante  
3. **Sequência de comandos** - Alguns dispositivos precisam de inicialização
4. **Timing específico** - Delays necessários entre comandos
5. **Dados proprietários** - Payload específico no buffer

---

## 🛠️ PREPARAÇÃO DO AMBIENTE

### 1️⃣ Instalar USBPcap

```bash
# Baixar e instalar
https://desowin.org/usbpcap/

# IMPORTANTE: Instalar como ADMINISTRADOR
# Reiniciar o computador após instalação
```

### 2️⃣ Instalar Wireshark

```bash
# Baixar versão mais recente
https://www.wireshark.org/

# Verificar se USBPcap está disponível:
# Wireshark → Capture → Interfaces
# Deve aparecer "USBPcap1" ou similar
```

### 3️⃣ Instalar Software Oficial da SkyCam

Você **PRECISA** do software original da SkyCam para gerar o tráfego USB de referência.

---

## 📊 PROCEDIMENTO COMPLETO

### FASE 1: Captura de Baseline

#### 1️⃣ Preparar Captura
```bash
# Abrir Wireshark como ADMINISTRADOR
# Ir em: Capture → Interfaces
# Selecionar: USBPcap1 (ou interface USB disponível)
```

#### 2️⃣ Configurar Filtros Iniciais
```wireshark
# Filtro por dispositivo (opcional no início)
usb.device_address == X

# Filtro por tipo de controle
usb.transfer_type == 0x02

# Filtro por direção
usb.endpoint_address.direction == 0  # OUT (comandos)
usb.endpoint_address.direction == 1  # IN (respostas)
```

#### 3️⃣ Executar Captura de Baseline
```bash
1. DESCONECTAR a SkyCam fisicamente
2. INICIAR captura no Wireshark
3. RECONECTAR a SkyCam
4. AGUARDAR inicialização (30 segundos)
5. PARAR captura
6. SALVAR como "skycam-baseline.pcapng"
```

### FASE 2: Captura de Comandos Específicos

#### 1️⃣ Captura de Flash
```bash
1. INICIAR nova captura
2. ABRIR software oficial da SkyCam
3. AGUARDAR estabilização (10 segundos)
4. CLICAR "Ligar Flash" no software oficial
5. AGUARDAR 2 segundos
6. CLICAR "Desligar Flash" no software oficial
7. AGUARDAR 2 segundos
8. REPETIR ciclo liga/desliga 3 vezes
9. PARAR captura
10. SALVAR como "skycam-flash-commands.pcapng"
```

#### 2️⃣ Captura de Foco
```bash
1. INICIAR nova captura
2. MOVER controle de foco para posição mínima
3. AGUARDAR 2 segundos
4. MOVER para posição máxima
5. AGUARDAR 2 segundos
6. MOVER para posição média
7. AGUARDAR 2 segundos
8. REPETIR sequência 2 vezes
9. PARAR captura
10. SALVAR como "skycam-focus-commands.pcapng"
```

---

## 🔍 ANÁLISE DOS DADOS

### 1️⃣ Identificar Comandos de Controle

#### Filtros Úteis:
```wireshark
# Apenas comandos de controle OUT
usb.transfer_type == 0x02 && usb.endpoint_address.direction == 0

# Vendor specific commands
usb.bmRequestType == 0x40

# UVC Class commands  
usb.bmRequestType == 0x21

# Respostas de leitura
usb.bmRequestType == 0xc0 || usb.bmRequestType == 0xa1
```

### 2️⃣ Analisar Estrutura dos Comandos

Para cada comando importante, anote:

```bash
Frame: [número do frame]
├── bmRequestType: 0x40 (Vendor Device Out)
├── bRequest: 0x05 (Comando específico)
├── wValue: 0x0001 (Parâmetro principal)
├── wIndex: 0x0000 (Interface/Unit)
├── wLength: 0 (Tamanho dos dados)
└── Data: [dados do payload, se houver]
```

### 3️⃣ Identificar Padrões de Flash

#### Procurar por:
```bash
# Comando LIGAR flash
bmRequestType: 0x40
bRequest: 0x?? (anotar valor)
wValue: 0x0001 / 0x00FF / 0x?? (valor para LIGAR)
wIndex: 0x?? (anotar)

# Comando DESLIGAR flash  
bmRequestType: 0x40
bRequest: 0x?? (mesmo bRequest do LIGAR)
wValue: 0x0000 (valor para DESLIGAR)
wIndex: 0x?? (mesmo wIndex)
```

### 4️⃣ Identificar Padrões de Foco

#### UVC Padrão:
```bash
bmRequestType: 0x21 (Class Interface Out)
bRequest: 0x01 (SET_CUR)
wValue: 0x0600 (Focus Control)
wIndex: 0x???? (Unit ID + Interface)
Data: [2 bytes com valor do foco]
```

#### Proprietário:
```bash
bmRequestType: 0x40 (Vendor Device Out)
bRequest: 0x?? (comando específico)
wValue: [valor do foco 0-255]
wIndex: 0x?? (interface)
```

---

## 🧪 VALIDAÇÃO DOS COMANDOS DESCOBERTOS

### 1️⃣ Criar Script de Teste

Crie o arquivo `test-discovered-commands.js`:

```javascript
const usb = require('usb');

// Cole aqui os comandos descobertos no Wireshark:
const DISCOVERED_COMMANDS = {
    flash: {
        on: { bmRequestType: 0x40, bRequest: 0x05, wValue: 0x0001, wIndex: 0x0000 },
        off: { bmRequestType: 0x40, bRequest: 0x05, wValue: 0x0000, wIndex: 0x0000 }
    },
    focus: {
        // Exemplo UVC
        uvc: { bmRequestType: 0x21, bRequest: 0x01, wValue: 0x0600, wIndex: 0x0500 },
        // Exemplo proprietário  
        vendor: { bmRequestType: 0x40, bRequest: 0x06, wValue: 0x00, wIndex: 0x0000 }
    }
};

async function testDiscoveredCommands() {
    const device = usb.findByIds(0x3151, 0x3020);
    if (!device) {
        console.log('❌ SkyCam não encontrada');
        return;
    }
    
    device.open();
    console.log('🎯 Testando comandos descobertos...');
    
    // Testar flash LIGAR
    console.log('💡 Testando flash LIGAR...');
    await sendCommand(device, DISCOVERED_COMMANDS.flash.on);
    await sleep(2000);
    
    // Testar flash DESLIGAR
    console.log('🔅 Testando flash DESLIGAR...');
    await sendCommand(device, DISCOVERED_COMMANDS.flash.off);
    await sleep(2000);
    
    // Testar foco
    console.log('🎯 Testando foco...');
    if (DISCOVERED_COMMANDS.focus.uvc) {
        await testFocusUVC(device, 128);
    }
    if (DISCOVERED_COMMANDS.focus.vendor) {
        await testFocusVendor(device, 128);
    }
    
    device.close();
    console.log('✅ Testes concluídos');
}

async function sendCommand(device, cmd) {
    return new Promise((resolve) => {
        device.controlTransfer(
            cmd.bmRequestType, cmd.bRequest, cmd.wValue, cmd.wIndex,
            Buffer.alloc(0),
            (error, data) => {
                if (error) {
                    console.log(`❌ Comando falhou: ${error.message}`);
                } else {
                    console.log(`✅ Comando enviado com sucesso`);
                }
                resolve(!error);
            }
        );
    });
}

async function testFocusUVC(device, value) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value, 0);
    
    return new Promise((resolve) => {
        device.controlTransfer(
            DISCOVERED_COMMANDS.focus.uvc.bmRequestType,
            DISCOVERED_COMMANDS.focus.uvc.bRequest,
            DISCOVERED_COMMANDS.focus.uvc.wValue,
            DISCOVERED_COMMANDS.focus.uvc.wIndex,
            buffer,
            (error, data) => {
                console.log(`📊 Foco UVC: ${error ? 'FALHOU' : 'SUCESSO'}`);
                resolve(!error);
            }
        );
    });
}

async function testFocusVendor(device, value) {
    return new Promise((resolve) => {
        device.controlTransfer(
            DISCOVERED_COMMANDS.focus.vendor.bmRequestType,
            DISCOVERED_COMMANDS.focus.vendor.bRequest,
            value, // valor diretamente no wValue
            DISCOVERED_COMMANDS.focus.vendor.wIndex,
            Buffer.alloc(0),
            (error, data) => {
                console.log(`📊 Foco Vendor: ${error ? 'FALHOU' : 'SUCESSO'}`);
                resolve(!error);
            }
        );
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Executar testes
testDiscoveredCommands().catch(console.error);
```

### 2️⃣ Executar Validação

```bash
node test-discovered-commands.js
```

### 3️⃣ Observar Mudanças Físicas

⚠️ **IMPORTANTE**: Observe atentamente se:
- O flash/LED **fisicamente muda** de estado
- O foco da lente **realmente se move**
- Há algum som/vibração do motor de foco

---

## 🎯 EXEMPLOS PRÁTICOS

### Exemplo 1: Flash Descoberto

**No Wireshark encontrei:**
```
Frame 245: URB_CONTROL out
├── bmRequestType: 0x40
├── bRequest: 0x05  
├── wValue: 0x00ff
├── wIndex: 0x0000
└── wLength: 0
```

**No código uso:**
```javascript
// Flash LIGAR
await device.controlTransfer(0x40, 0x05, 0x00ff, 0x0000, Buffer.alloc(0));

// Flash DESLIGAR  
await device.controlTransfer(0x40, 0x05, 0x0000, 0x0000, Buffer.alloc(0));
```

### Exemplo 2: Foco UVC Descoberto

**No Wireshark encontrei:**
```
Frame 312: URB_CONTROL out
├── bmRequestType: 0x21
├── bRequest: 0x01
├── wValue: 0x0600
├── wIndex: 0x0500
├── wLength: 2
└── Data: 80 00 (valor 128 em little-endian)
```

**No código uso:**
```javascript
// Foco para valor 128
const buffer = Buffer.alloc(2);
buffer.writeUInt16LE(128, 0);
await device.controlTransfer(0x21, 0x01, 0x0600, 0x0500, buffer);
```

---

## 🔧 DICAS AVANÇADAS

### 1️⃣ Sequência de Inicialização

Alguns dispositivos precisam de comandos de inicialização:

```bash
# Procurar por comandos logo após reconexão
# Anotar TODA a sequência inicial
# Pode incluir:
- GET_DESCRIPTOR
- SET_CONFIGURATION  
- CLAIM_INTERFACE
- Comandos vendor específicos
```

### 2️⃣ Comandos com Dados

```bash
# Se wLength > 0, há dados no payload
# Anotar EXATAMENTE os bytes enviados
# Exemplo:
Data: 01 00 ff 20 -> [0x01, 0x00, 0xFF, 0x20]
```

### 3️⃣ Timing Crítico

```bash
# Observar delays entre comandos
# Alguns dispositivos são sensíveis ao timing
# Implementar delays semelhantes no código
```

### 4️⃣ Estados do Dispositivo

```bash
# Observar se há comandos que mudam "modo" do dispositivo
# Exemplo: modo normal vs modo configuração
# Pode ser necessário entrar em modo específico antes dos controles
```

---

## ⚠️ PROBLEMAS COMUNS

### 1. "Nenhum tráfego USB capturado"
```bash
✅ Verificar se USBPcap está instalado corretamente
✅ Executar Wireshark como ADMINISTRADOR
✅ Reconectar dispositivo após iniciar captura
✅ Verificar se interface USB correta está selecionada
```

### 2. "Muitos pacotes irrelevantes"
```bash
✅ Usar filtro: usb.device_address == X (descobrir X primeiro)
✅ Filtrar por: usb.transfer_type == 0x02 (apenas controle)
✅ Capturar apenas durante ações específicas
```

### 3. "Comando funciona no Wireshark mas não no código"
```bash
✅ Verificar endianness dos dados (little vs big endian)
✅ Conferir se todos os parâmetros estão corretos
✅ Implementar mesma sequência de comandos
✅ Verificar timing entre comandos
```

### 4. "Flash pisca uma vez e para"
```bash
✅ Pode ser comando único, não estado persistente
✅ Tentar enviar comando periodicamente
✅ Procurar comando de "modo contínuo"
```

---

## 🎉 SUCESSO GARANTIDO

Seguindo este guia sistematicamente, você VAI descobrir os comandos corretos. A combinação de:

1. **Captura precisa** com Wireshark
2. **Análise detalhada** dos pacotes  
3. **Teste sistemático** dos comandos
4. **Validação física** das mudanças

É a fórmula comprovada para **engenharia reversa USB bem-sucedida**.

---

## 📞 TROUBLESHOOTING

Se ainda assim não funcionar:

1. **Verificar hardware**: Câmera pode ter modos específicos
2. **Conferir drivers**: Drivers do Windows podem interferir
3. **Testar em Linux**: Às vezes mais compatível com USB raw
4. **Verificar alimentação**: USB pode não fornecer energia suficiente
5. **Consultar firmware**: Versões diferentes podem ter protocolos diferentes

**Lembre-se**: Cada dispositivo é único, mas os princípios são universais. Persistência e análise sistemática sempre levam ao sucesso! 🚀

---

## 📚 REFERÊNCIAS

- [USB 2.0 Specification](https://www.usb.org/documents)
- [UVC 1.1 Class Specification](https://www.usb.org/sites/default/files/documents/USB_Video_Class_1_1_090711.zip)
- [Wireshark USB Documentation](https://wiki.wireshark.org/CaptureSetup/USB)
- [USBPcap Documentation](https://desowin.org/usbpcap/tour.html)