# Setup WhisperX com Diarização (Identificação de Falantes)

## 🎯 O que vamos fazer:

1. Criar token Hugging Face (GRÁTIS)
2. Aceitar termos dos modelos de diarização
3. Configurar secret no Modal
4. Deployar WhisperX v2 com diarização
5. Testar!

---

## Passo 1: Criar Token Hugging Face (5 minutos)

### 1.1 Criar conta (se não tiver)
1. Acesse: https://huggingface.co/join
2. Crie conta gratuita com email

### 1.2 Gerar Access Token
1. Acesse: https://huggingface.co/settings/tokens
2. Clique em **"New token"**
3. Configure:
   - **Name:** `modal-whisperx-diarization`
   - **Type:** Escolha **"Read"** (não precisa de Write)
4. Clique em **"Generate"**
5. **COPIE O TOKEN** e guarde em lugar seguro (não consegue ver depois!)
   - Formato: `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 1.3 Aceitar Termos dos Modelos de Diarização

**Modelo 1: Segmentation 3.0**
1. Acesse: https://huggingface.co/pyannote/segmentation-3.0
2. Faça login se necessário
3. Role a página até ver **"Agree and access repository"**
4. Clique em **"Agree"**

**Modelo 2: Speaker Diarization 3.1**
1. Acesse: https://huggingface.co/pyannote/speaker-diarization-3.1
2. Role a página até ver **"Agree and access repository"**
3. Clique em **"Agree"**

✅ **Pronto!** Agora você tem acesso aos modelos de diarização!

---

## Passo 2: Configurar Secret no Modal

### Opção A: Via Web (Recomendado)

1. Acesse: https://modal.com/secrets
2. Clique em **"New secret"**
3. Configure:
   - **Name:** `huggingface-secret`
   - **Key:** `HF_TOKEN`
   - **Value:** Cole o token que você copiou (`hf_xxxxx...`)
4. Clique em **"Create"**

### Opção B: Via CLI

```bash
.venv-modal\Scripts\modal.exe secret create huggingface-secret HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

(Substitua `hf_xxxxx` pelo seu token real)

---

## Passo 3: Deploy WhisperX v2

Execute no terminal:

```bash
.venv-modal\Scripts\modal.exe deploy modal_whisperx_v2.py
```

Aguarde 5-10 minutos para build da imagem.

Ao final, você verá:

```
✓ Created web function fastapi-app.
✓ App deployed! 🎉

View Deployment: https://modal.com/apps/ap-xxxxx
```

---

## Passo 4: Obter URL do Endpoint

### Opção A: Via Dashboard Modal

1. Acesse: https://modal.com/apps
2. Procure o app **"whisperx-vitallcam-v2"**
3. Clique nele
4. Copie a URL do endpoint **"fastapi-app"**
   - Formato: `https://seuusuario--whisperx-vitallcam-v2-fastapi-app.modal.run`

### Opção B: Testar endpoint

Execute um dos comandos abaixo após o deploy:

**Windows PowerShell:**
```powershell
Invoke-WebRequest -Uri "https://seuusuario--whisperx-vitallcam-v2-fastapi-app.modal.run/" -Method GET
```

**Git Bash / Linux / Mac:**
```bash
curl https://seuusuario--whisperx-vitallcam-v2-fastapi-app.modal.run/
```

Resposta esperada:
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

## Passo 5: Atualizar .env.local

Edite o arquivo `.env.local` e atualize a URL:

```env
# Substituir a URL antiga pela nova:
MODAL_WHISPERX_ENDPOINT=https://seuusuario--whisperx-vitallcam-v2-fastapi-app.modal.run/transcribe
```

⚠️ **IMPORTANTE:** Adicione `/transcribe` no final da URL!

---

## Passo 6: Testar!

1. Reinicie o servidor Next.js:
```bash
# Parar o servidor atual (Ctrl+C)
npm run dev
```

2. Acesse: http://localhost:3000

3. Navegue até a página de um paciente

4. Clique no botão de microfone 🎤

5. Fale algo em português (se tiver mais de uma pessoa, faça as duas falarem)

6. Aguarde a transcrição aparecer!

7. **Se diarização funcionar**, você verá algo como:
```
[SPEAKER_00]: Olá, como vai?
[SPEAKER_01]: Tudo bem, e você?
```

---

## 🎉 O que mudou na v2?

### Melhorias:

1. **Diarização de Falantes**
   - Identifica quem está falando (SPEAKER_00, SPEAKER_01, etc.)
   - Você pode especificar min/max speakers

2. **FastAPI com CORS**
   - Permite requisições do navegador
   - Melhor tratamento de erros

3. **Alinhamento de Timestamps**
   - Timestamps mais precisos palavra por palavra

4. **Cache Otimizado**
   - Usa volume persistente para modelos
   - Inicialização mais rápida após primeira vez

5. **Health Checks**
   - Endpoint `/health` para monitorar status

6. **Logs Detalhados**
   - Cada step do processo está logado
   - Fácil debug via Modal dashboard

---

## Troubleshooting

### "No HF token - diarization disabled"

- Verifique se criou o secret corretamente
- Nome DEVE ser exatamente: `huggingface-secret`
- Key DEVE ser: `HF_TOKEN`

### "Diarization failed"

- Verifique se aceitou os termos dos 2 modelos
- Token deve ter permissão de Read
- Aguarde alguns minutos após aceitar termos (pode demorar para propagar)

### "Transcription empty / vazia"

- Verifique se o áudio tem fala
- Teste com áudio mais longo (>3 segundos)
- Verifique logs do Modal:
  ```bash
  .venv-modal\Scripts\modal.exe app logs whisperx-vitallcam-v2
  ```

### Erro 500 ou timeout

- Primeira transcrição demora ~30-60s (carregando GPU)
- Próximas são mais rápidas (~5-10s)
- Áudios muito longos (>10 min) podem dar timeout

---

## Custos

- **Hugging Face:** GRÁTIS
- **Modal:**
  - GPU A10G: ~$1.10/hora
  - Você só paga quando usa
  - Container desliga após 5 min de inatividade
  - Estimativa: ~$0.01 por transcrição de 1 minuto

---

## Próximos Passos (Opcional)

Se quiser melhorar ainda mais:

1. **Ajustar número de speakers:**
   - Editar `useTranscription.ts` para enviar `min_speakers` e `max_speakers`

2. **Melhorar UI para mostrar speakers:**
   - Colorir cada speaker diferente
   - Mostrar "Pessoa 1:", "Pessoa 2:", etc.

3. **Salvar speakers no Supabase:**
   - Adicionar coluna `speaker` na tabela `transcription_segments`

---

**Data:** 2025-10-25
**Versão:** 2.0
**Status:** Pronto para deploy! 🚀
