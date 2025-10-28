# 🚀 COMO FAZER DEPLOY - WhisperX V3

## ⚡ OPÇÃO 1: Script Automático (Recomendado)

Abra o PowerShell na pasta do projeto e execute:

```powershell
.\deploy_whisperx_v3.ps1
```

O script vai:
1. ✅ Verificar se o Modal está instalado
2. ✅ Verificar se o arquivo existe
3. ✅ Fazer o deploy
4. ✅ Mostrar o endpoint gerado
5. ✅ Dar instruções do próximo passo

---

## 🔧 OPÇÃO 2: Comando Manual

Se preferir executar manualmente:

```powershell
.venv-modal\Scripts\modal.exe deploy modal_whisperx_v2.py
```

---

## ⏱️ TEMPO ESPERADO

- **Primeira vez:** 5-10 minutos (download de modelos ~3GB)
- **Deploys seguintes:** 1-2 minutos (usa cache)

---

## 📋 APÓS O DEPLOY

### 1. Copiar o Endpoint

O deploy vai gerar um endpoint como:
```
https://arthurgabriel-birer--whisperx-vitallcam-v3-production-fastapi-app.modal.run
```

### 2. Atualizar .env.local

Edite o arquivo `.env.local` e adicione/atualize:

```env
MODAL_WHISPERX_ENDPOINT=https://arthurgabriel-birer--whisperx-vitallcam-v3-production-fastapi-app.modal.run/transcribe
```

⚠️ **IMPORTANTE:** Não esqueça o `/transcribe` no final!

### 3. Reiniciar Next.js

```bash
# Parar o servidor (Ctrl+C se estiver rodando)
# Depois:
npm run dev
```

### 4. Testar

1. Abrir http://localhost:3000
2. Entrar em perfil de paciente
3. Clicar no botão roxo flutuante
4. Permitir acesso ao microfone
5. Falar por 30-60 segundos
6. Clicar em "Parar"
7. Aguardar processamento
8. Verificar resultado

---

## 🔍 VERIFICAR SE ESTÁ FUNCIONANDO

### Testar Endpoint Diretamente

Abra no navegador:
```
https://arthurgabriel-birer--whisperx-vitallcam-v3-production-fastapi-app.modal.run
```

Deve retornar algo como:
```json
{
  "service": "WhisperX Transcription API",
  "status": "online",
  "version": "2.0",
  "model": "large-v3",
  "diarization": "enabled",
  "language": "pt (Portuguese)"
}
```

---

## ❌ PROBLEMAS COMUNS

### Erro: "Not authenticated"

**Solução:**
```powershell
.venv-modal\Scripts\modal.exe token new
```

Depois fazer deploy novamente.

---

### Erro: "Module not found"

**Solução:**
```powershell
cd .venv-modal
Scripts\pip.exe install modal
```

---

### Erro: "GPU quota exceeded"

**Solução:**
- Aguardar alguns minutos
- Modal tem limite de GPU simultâneas
- Ou usar GPU menor (mudar de A10G para T4)

---

### Deploy travou / muito lento

**Causas possíveis:**
- Download de modelos (primeira vez é lento)
- Conexão lenta
- Modal está buildando a imagem Docker

**Solução:**
- Aguardar (pode demorar até 10 minutos na primeira vez)
- Verificar conexão com internet

---

## 📊 VERIFICAR LOGS DO MODAL

### Ver logs em tempo real:

```powershell
.venv-modal\Scripts\modal.exe app logs whisperx-vitallcam-v3-production
```

### Ver apps deployados:

```powershell
.venv-modal\Scripts\modal.exe app list
```

---

## 🎯 COMPARAR COM V2

Se quiser comparar a qualidade:

1. Testar uma frase com v2 (endpoint antigo)
2. Testar a MESMA frase com v3 (endpoint novo)
3. Comparar resultados

**Esperado:** v3 deve capturar 85-90% mais palavras!

---

## 📚 DOCUMENTAÇÃO COMPLETA

Para entender TUDO que foi mudado, veja:
```
MELHORIAS-TRANSCRICAO-V3.md
```

---

## ✅ CHECKLIST FINAL

- [ ] Deploy concluído sem erros
- [ ] Endpoint copiado
- [ ] .env.local atualizado
- [ ] Next.js reiniciado
- [ ] Teste de transcrição realizado
- [ ] Resultado melhor que v2
- [ ] Celebrar! 🎉

---

**Dúvidas?** Verifique os logs do console (F12 no navegador).
