# 🎯 SkyCam Advanced Control System

## 📋 VISÃO GERAL

Sistema completo de controle avançado para **SkyCam Slim** (VID: 0x3151, PID: 0x3020) via engenharia reversa USB, desenvolvido especificamente para resolver o problema de comandos que retornam "STATUS OK" mas não efetivam mudanças físicas no hardware.

### 🎯 PROBLEMA RESOLVIDO

- ✅ **Comandos aceitos mas sem efeito físico**
- ✅ **Flash não muda de estado real**  
- ✅ **Foco apenas simulado**
- ✅ **Parâmetros USB incorretos**
- ✅ **Protocolos proprietários não documentados**

---

## 🚀 FUNCIONALIDADES

### 🔧 Sistema Principal
- **Configuração robusta de interfaces USB**
- **Força bruta inteligente para descoberta de protocolos**  
- **Controle de foco (UVC + proprietário) com retries**
- **Controle de flash (vendor-out) com fallbacks**
- **Validação de status pós-comando**

### 📹 Streaming de Vídeo
- **Captura de frames USB (MJPEG/YUYV/RGB)**
- **Streaming HTTP MJPEG em tempo real**
- **Endpoint: http://localhost:8080/stream.mjpeg**
- **Análise de qualidade de imagem para autofoco**

### 🌐 Interface Web
- **Interface web completa de controle**
- **Monitoramento em tempo real**
- **Logs detalhados**
- **WebSocket para atualizações instantâneas**

### 🔍 Análise Wireshark
- **Guia completo de captura USB**
- **Comparação com software oficial**
- **Validação de pacotes reais**

---

## 📁 ESTRUTURA DO PROJETO

```
VitallCam/
├── 📄 skycam-real-control.js      # Script principal
├── 🚀 bruteforce-module.js        # Força bruta inteligente  
├── 📹 video-stream-module.js      # Captura e streaming
├── 🌐 web-interface.js            # Interface web
├── 📚 WIRESHARK-GUIDE.md          # Guia Wireshark completo
├── 📋 README-SKYCAM.md            # Este arquivo
├── 📦 package.json               # Dependências
└── 📝 logs/                      # Logs do sistema
```

---

## ⚡ INSTALAÇÃO RÁPIDA

### 1️⃣ Instalar Dependências

```bash
# Instalar pacotes Node.js
npm install

# Verificar se a SkyCam está conectada
node -e "console.log(require('usb').getDeviceList().find(d => d.deviceDescriptor.idVendor === 0x3151))"
```

### 2️⃣ Executar Sistema

```bash
# Iniciar controle completo (como ADMINISTRADOR)
node skycam-real-control.js

# OU iniciar apenas força bruta
node bruteforce-module.js

# OU testar apenas vídeo
node video-stream-module.js
```

### 3️⃣ Acessar Interface

```bash
# Abrir no navegador
http://localhost:8080

# Stream direto
http://localhost:8080/stream.mjpeg
```

---

## 🎮 COMO USAR

### Cenário 1: Controles Não Funcionam

1. **Execute o sistema principal:**
   ```bash
   node skycam-real-control.js
   ```

2. **Acesse http://localhost:8080**

3. **Clique em "⚡ Força Bruta Completa"**

4. **Aguarde a descoberta automática dos protocolos**

5. **Teste os controles descobertos**

### Cenário 2: Análise com Wireshark

1. **Leia o guia completo:**
   ```bash
   # Abrir o guia
   code WIRESHARK-GUIDE.md
   ```

2. **Execute captura conforme instruções**

3. **Analise os pacotes USB reais**

4. **Atualize os comandos descobertos:**
   ```javascript
   // Em skycam-real-control.js, linha ~76
   this.baseProtocols = {
       flash: [
           {
               name: 'Flash Command Discovered',
               bmRequestType: 0x40, // Seu valor do Wireshark
               bRequest: 0x05,      // Seu valor do Wireshark  
               wIndex: 0x0000,      // Seu valor do Wireshark
               onValue: 0xFF,       // Valor para ligar
               offValue: 0x00       // Valor para desligar
           }
       ]
   };
   ```

### Cenário 3: Integração com Seu Sistema

```javascript
// Importar o controle
const SkyCamController = require('./skycam-real-control.js');

// Criar instância
const skycam = new SkyCamController();

// Conectar
await skycam.connect();

// Controlar flash
await skycam.setFlash(true);  // ligar
await skycam.setFlash(false); // desligar

// Controlar foco  
await skycam.setFocus(128); // 0-255

// Desconectar
await skycam.cleanup();
```

---

## 🔍 ANÁLISE DE LOGS

### Logs Principais

```bash
# Log da sessão atual
skycam-session-TIMESTAMP.log

# Protocolos descobertos
discovered-protocols.json

# Relatório de força bruta
discovery-report-TIMESTAMP.json
```

### Interpretação dos Logs

```bash
✅ [USB] Comando enviado = STATUS OK
❌ [USB] Comando falhou = Parâmetro incorreto
📊 [FLASH] Estado lido: LIGADO = Validação física OK
⚠️ [FLASH] NÃO CONFIRMADO = Comando aceito mas sem efeito
```

---

## 🧪 TESTES E VALIDAÇÃO

### Teste 1: Conectividade Básica

```bash
node -e "
const SkyCam = require('./skycam-real-control.js');
(async () => {
  const skycam = new SkyCam();
  const connected = await skycam.connect();
  console.log('Conectado:', connected);
  await skycam.cleanup();
})();"
```

### Teste 2: Comandos Específicos  

```bash
# Testar apenas flash
node -e "
const SkyCam = require('./skycam-real-control.js');
(async () => {
  const skycam = new SkyCam();
  await skycam.connect();
  await skycam.setFlash(true);
  await new Promise(r => setTimeout(r, 2000));
  await skycam.setFlash(false);
  await skycam.cleanup();
})();"
```

### Teste 3: Força Bruta Focada

```bash
# Testar apenas descoberta de flash
node -e "
const BruteForce = require('./bruteforce-module.js');
const SkyCam = require('./skycam-real-control.js');
(async () => {
  const skycam = new SkyCam();
  await skycam.connect();
  const bf = new BruteForce(skycam);
  await bf.discoverFlashProtocols();
  await skycam.cleanup();
})();"
```

---

## ⚙️ CONFIGURAÇÃO AVANÇADA

### Modificar Parâmetros de Força Bruta

```javascript
// Em bruteforce-module.js, linha ~37
const BRUTE_FORCE_CONFIG = {
    DELAY_BETWEEN_COMMANDS: 50,     // ms entre comandos
    MAX_ATTEMPTS: 5000,             // máximo de combinações
    TIMEOUT_PER_COMMAND: 2000,      // timeout por comando
    VALIDATION_DELAY: 200,          // delay para validar mudança física
    REQUIRED_VALIDATIONS: 2,        // quantas validações são necessárias
};
```

### Adicionar Protocolos Conhecidos

```javascript
// Em bruteforce-module.js, linha ~72
this.knownPatterns = {
    flash: [
        // Adicionar seus padrões descobertos aqui
        { bmRequestType: [0x40], bRequest: [0x05], wValue: [0x00, 0x01, 0xFF] }
    ]
};
```

### Configurar Streaming de Vídeo

```javascript
// Em video-stream-module.js, linha ~25
const VIDEO_CONFIG = {
    DEFAULT_WIDTH: 640,
    DEFAULT_HEIGHT: 480,
    JPEG_QUALITY: 85,
    MAX_FPS: 30,
    FRAME_BUFFER_SIZE: 10,
};
```

---

## 🔧 TROUBLESHOOTING

### Problema: "SkyCam não encontrada"

**Soluções:**
```bash
✅ Verificar se está conectada: lsusb | grep 3151
✅ Executar como administrador
✅ Fechar outros softwares que usam a câmera
✅ Reconectar USB
```

### Problema: "Interface já em uso"

**Soluções:**
```bash
✅ Fechar software oficial da SkyCam
✅ Verificar se outros scripts estão rodando
✅ Reiniciar o sistema
✅ Usar diferentes interfaces USB
```

### Problema: "Comando aceito mas sem efeito"

**Soluções:**
```bash
✅ Usar Wireshark para capturar comandos reais
✅ Verificar se precisa de sequência de inicialização
✅ Testar diferentes valores de wIndex/wValue
✅ Implementar delays entre comandos
```

### Problema: "Stream de vídeo não funciona"

**Soluções:**
```bash
✅ Verificar se endpoint de vídeo foi encontrado
✅ Tentar modo simulação primeiro
✅ Verificar se interface de vídeo foi reivindicada
✅ Usar diferentes formatos (MJPEG/YUYV)
```

---

## 📈 MONITORAMENTO DE PERFORMANCE

### Métricas Importantes

```javascript
// Status do sistema
const status = skycam.getSystemStatus();
console.log('Connected:', status.connected);
console.log('Working Protocols:', status.controls.workingProtocols);

// Estatísticas de força bruta  
const stats = bruteForce.getStats();
console.log('Success Rate:', stats.successfulCommands / stats.totalAttempts);

// Status de vídeo
const videoStatus = videoStream.getVideoStatus();
console.log('FPS:', videoStatus.fps);
console.log('Clients:', videoStatus.clients);
```

### Logs de Performance

```bash
# Monitorar em tempo real
tail -f skycam-session-*.log | grep "SUCCESS\|ERROR\|DISCOVERY"

# Estatísticas de sucesso
grep -c "✅" skycam-session-*.log
grep -c "❌" skycam-session-*.log
```

---

## 🔒 CONSIDERAÇÕES DE SEGURANÇA

### Permissões
- Execute sempre como **administrador** no Windows
- No Linux, adicione usuário ao grupo `dialout`
- Evite executar múltiplas instâncias simultaneamente

### Isolamento
- Teste em ambiente controlado primeiro
- Desconecte outros dispositivos USB desnecessários
- Faça backup de configurações importantes

### Validação
- Sempre valide mudanças físicas após comandos
- Monitore logs para detectar erros
- Implemente timeouts em todas as operações

---

## 🎯 RESULTADOS ESPERADOS

### Sucesso Total ✅
- Flash liga/desliga fisicamente
- Foco move a lente realmente  
- Stream de vídeo funcionando
- Protocolos descobertos e salvos
- Interface web responsiva

### Sucesso Parcial ⚠️
- Comandos aceitos mas validação falha
- Alguns protocolos funcionam, outros não
- Stream simulado funcionando
- Logs mostram tentativas de descoberta

### Falha ❌
- Dispositivo não conecta
- Nenhum comando aceito
- Interfaces não reivindicadas
- Erros de permissão

---

## 📞 SUPORTE

### Logs para Análise
Sempre incluir ao reportar problemas:
```bash
1. skycam-session-TIMESTAMP.log (log principal)
2. discovery-report-TIMESTAMP.json (relatório de descoberta)
3. discovered-protocols.json (protocolos encontrados)
4. Saída do console durante execução
5. Versão do Node.js e sistema operacional
```

### Informações do Sistema
```bash
# Coletar informações para suporte
node -e "
console.log('Node:', process.version);
console.log('Platform:', process.platform);
console.log('USB devices:', require('usb').getDeviceList().length);
"
```

---

## 🎉 CONTRIBUIÇÕES

### Como Contribuir
1. **Teste em diferentes modelos** de SkyCam
2. **Documente protocolos** que funcionaram  
3. **Reporte bugs** com logs detalhados
4. **Melhore a documentação**
5. **Adicione novos recursos**

### Protocolos Validados
Mantenha lista de protocolos confirmados:
```javascript
// Protocolo validado para SkyCam Slim v2.1
{
    model: "SkyCam Slim v2.1",
    firmware: "1.0.3",
    flash: { bmRequestType: 0x40, bRequest: 0x05, onValue: 0xFF, offValue: 0x00 },
    focus: { bmRequestType: 0x21, bRequest: 0x01, wValue: 0x0600, wIndex: 0x0500 }
}
```

---

## 📚 REFERÊNCIAS TÉCNICAS

- [USB 2.0 Specification](https://www.usb.org/documents)
- [UVC 1.1 Class Specification](https://www.usb.org/sites/default/files/documents/USB_Video_Class_1_1_090711.zip)
- [Node.js USB Library](https://github.com/node-usb/node-usb)
- [Wireshark USB Documentation](https://wiki.wireshark.org/CaptureSetup/USB)

---

## 📄 LICENÇA

MIT License - Use livremente para fins educacionais e comerciais.

**⚠️ AVISO**: Este software foi desenvolvido através de engenharia reversa para fins de compatibilidade. Use com responsabilidade e respeite os termos de uso do seu hardware.

---

**🚀 Desenvolvido com engenharia reversa avançada para resolver problemas reais de controle de hardware USB.**