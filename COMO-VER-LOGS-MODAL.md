# Como Ver Logs do Modal e Encontrar o Erro

## 🔍 Opção 1: Via Dashboard (Mais Fácil)

### 1. Acesse o dashboard:
```
https://modal.com/apps/arthurgabriel-birer/main/deployed/whisperx-vitallcam-v2
```

### 2. Procure pela aba "Logs" ou "Calls"

### 3. Clique na última chamada (a que falhou)

### 4. Procure por erros em VERMELHO contendo:
- `AttributeError`
- `np.NaN`
- `NumPy`
- `Traceback`
- `Exception`
- `failed`

### 5. **ME MANDE TODO O TEXTO** do erro, incluindo o traceback completo!

---

## 🔍 Opção 2: Via CLI (Terminal)

### 1. Abra PowerShell ou CMD

### 2. Execute:
```powershell
.venv-modal\Scripts\modal.exe app logs whisperx-vitallcam-v2
```

### 3. Deixe rodar por ~30 segundos

### 4. **COPIE E ME MANDE** as últimas 100-200 linhas

---

## ⚠️ O QUE ESTOU PROCURANDO:

Baseado no erro que você me mandou, o Modal está:

1. ✅ Recebendo o áudio (`Audio size: 483278 bytes`)
2. ❌ Falhando após ~5 minutos
3. ❌ Erro: `Parent input failed`

Isso significa que **dentro do método `transcribe`** algo está crashando.

**Possíveis causas:**

### A) NumPy ainda está dando problema
Se ver: `AttributeError: 'np.NaN' was removed`

### B) GPU não está inicializando
Se ver: `CUDA not available` ou `No GPU found`

### C) WhisperX está falhando ao carregar
Se ver: `Failed to load model` ou `whisperx` no erro

### D) Memória insuficiente
Se ver: `Out of memory` ou `OOM`

### E) Timeout
Se ver: `timeout` ou `exceeded`

---

## 🔧 ENQUANTO ISSO, TESTE O ENDPOINT DIRETAMENTE:

### Windows PowerShell:

```powershell
# Crie um arquivo de teste pequeno (10 segundos de silêncio)
$url = "https://arthurgabriel-birer--whisperx-vitallcam-v2-fastapi-app.modal.run/transcribe"

# Depois de criar um arquivo audio-test.webm (você pode gravar algo rápido no navegador)
# Use esse comando:
Invoke-WebRequest -Uri $url -Method POST -InFile "audio-test.webm" -ContentType "multipart/form-data"
```

---

## 📸 OU ME MANDE PRINTS:

Se for mais fácil, tire prints de:

1. **Dashboard Modal** → Aba "Calls" → Última chamada falhada
2. **Console do navegador** (F12) → Aba "Network" → Requisição `/api/transcribe` → Response

---

## 🚨 SUSPEITA PRINCIPAL:

Olhando o erro, parece que:

**O Modal está demorando 5 minutos e depois dando timeout.**

Isso pode significar:
1. GPU não está inicializando
2. WhisperX está travando ao carregar o modelo
3. Algum erro silencioso está acontecendo

**Preciso ver os logs completos do Modal para diagnosticar!**

---

## 📋 CHECKLIST:

- [ ] Acesse https://modal.com/apps (dashboard)
- [ ] Clique em `whisperx-vitallcam-v2`
- [ ] Vá na aba "Calls" ou "Logs"
- [ ] Encontre a última chamada falhada (vermelho)
- [ ] **COPIE TODO O LOG** dessa chamada
- [ ] Me mande aqui!

---

**Aguardando os logs! 🔍**
