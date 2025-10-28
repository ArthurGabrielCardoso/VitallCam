# 📹 CAPTURA WIRESHARK SEM APP OFICIAL

## 🎯 ESTRATÉGIA

Usar software genérico UVC + Wireshark para capturar comandos reais.

## 📋 SOFTWARE GENÉRICO PARA TESTAR

### 1. **OBS Studio** (Recomendado)
```bash
# Baixar: https://obsproject.com/
# Adicionar fonte: Video Capture Device
# Selecionar SkyCam
# Mudar configurações (resolução, fps)
```

### 2. **Windows Camera App**
```bash
# Pressionar Win + S
# Digitar "Camera"
# Abrir app nativo
# Usar controles de zoom/foco se disponíveis
```

### 3. **VLC Media Player**
```bash
# Media → Open Capture Device
# Capture Mode: DirectShow
# Video device name: Selecionar SkyCam
# Advanced Options → configurar
```

### 4. **AMCap** (Profissional)
```bash
# Baixar: https://www.microsoft.com/en-us/download/details.aspx?id=6812
# Ferramenta específica para testar câmeras USB
# Acesso a configurações avançadas UVC
```

## 🔍 PROCEDIMENTO DE CAPTURA

### FASE 1: Preparação
```bash
1. Instalar Wireshark + USBPcap
2. Baixar OBS Studio
3. Conectar SkyCam
4. Abrir Wireshark como ADMINISTRADOR
```

### FASE 2: Captura Durante Uso do OBS
```bash
1. INICIAR captura Wireshark (interface USBPcap)
2. ABRIR OBS Studio
3. ADICIONAR Video Capture Device
4. SELECIONAR SkyCam na lista
5. AGUARDAR inicialização (30 segundos)
6. ALTERAR configurações:
   - Resolução: 640x480 → 1280x720 → 1920x1080
   - FPS: 15 → 30 → 60
   - Configurações avançadas se disponíveis
7. FECHAR OBS
8. PARAR captura Wireshark
9. SALVAR como "skycam-obs-session.pcapng"
```

### FASE 3: Captura Durante Uso Windows Camera
```bash
1. INICIAR nova captura Wireshark
2. ABRIR Windows Camera App
3. AGUARDAR detecção da SkyCam
4. USAR controles disponíveis:
   - Botão de zoom (se disponível)
   - Configurações de vídeo
   - Botão de foto/vídeo
5. FECHAR app
6. PARAR captura
7. SALVAR como "skycam-windows-camera.pcapng"
```

## 🔍 COMANDOS TÍPICOS A PROCURAR

### Inicialização UVC:
```wireshark
# Filtro: usb.bmRequestType == 0x80 && usb.bRequest == 0x06
# GET_DESCRIPTOR requests
# SET_CONFIGURATION
# SET_INTERFACE
```

### Controle de Stream:
```wireshark
# Filtro: usb.bmRequestType == 0x21 && usb.bRequest == 0x01
# SET_CUR commands para:
# - Video Probe Control
# - Video Commit Control  
# - Frame Rate Control
```

### Controles de Câmera:
```wireshark
# Filtro: usb.transfer_type == 0x02
# Procurar por wValue interessantes:
# - 0x0600 (Focus)
# - 0x0100 (Brightness)
# - 0x0200 (Contrast)
# - wIndex específicos da SkyCam
```

## 🎯 ANÁLISE DIRECIONADA

### 1. Identificar Unit IDs
```bash
# No Wireshark, procurar por GET_DESCRIPTOR
# Device Descriptor → Interface Descriptors
# Anotar bInterfaceNumber e Unit IDs
```

### 2. Mapear Controles UVC
```bash
# Procurar padrão:
bmRequestType: 0x21 (Class Interface Out)
bRequest: 0x01 (SET_CUR)
wValue: 0x06XX (Controle específico)
wIndex: [Unit ID][Interface Number]
```

### 3. Detectar Comandos Proprietários
```bash
# Procurar padrão:
bmRequestType: 0x40 (Vendor Device Out)
bRequest: 0x?? (Comando proprietário)
wValue: [Parâmetro]
wIndex: [Interface/Unit]
```

## ⚡ DICA AVANÇADA

Se **nenhum software conseguir alterar configurações** da SkyCam, isso indica que ela usa **comandos 100% proprietários**.

Neste caso, o **script de descoberta automática** é sua melhor opção!