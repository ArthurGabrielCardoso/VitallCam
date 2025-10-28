# Correções na Transcrição - VitallCam

## Data: 25/10/2025

## Problemas Relatados pelo Usuário:

1. **Botão de transcrição inativo** - Usuário não consegue parar a transcrição
2. **Idioma sempre em português** - Garantir que sempre transcreva em PT

---

## Correções Aplicadas:

### 1. Idioma Português Fixo ✅

**Arquivo**: `src/app/api/transcribe/route.ts`

**Mudança**:
```typescript
// ANTES:
const language = formData.get('language') as string || 'pt'
modalFormData.append('language', language)

// DEPOIS:
modalFormData.append('language', 'pt') // SEMPRE PORTUGUÊS
```

**Motivo**: Garantir que SEMPRE transcreva em português, independente de qualquer parâmetro.

---

### 2. Correção do Envio de Áudio para Modal ✅

**Arquivo**: `src/app/api/transcribe/route.ts`

**Mudança**:
```typescript
// ANTES (ERRADO):
const audioBytes = await audioFile.arrayBuffer()
const modalFormData = new FormData()
modalFormData.append('audio_file', new Blob([audioBytes]))

// DEPOIS (CORRETO):
const modalFormData = new FormData()
modalFormData.append('audio_file', audioFile, audioFile.name || 'audio.webm')
```

**Motivo**: O Modal espera receber um `File` ou `Blob` com nome de arquivo. Estávamos enviando apenas os bytes brutos sem metadados.

---

### 3. Logs de Debug Adicionados ✅

**Arquivo**: `src/hooks/useTranscription.ts`

**Logs adicionados**:
- `[Transcrição] Solicitando acesso ao microfone...`
- `[Transcrição] Microfone autorizado`
- `[Transcrição] Iniciando processamento de áudio...`
- `[Transcrição] Enviando para API...`
- `[Transcrição] Resposta recebida: [status]`
- `[Transcrição] Resultado: [JSON]`
- `[Transcrição] ERRO ao processar áudio: [erro]`
- `[Transcrição] Finalizando processamento`

**Motivo**: Facilitar debug e identificar onde o processo pode estar travando.

---

## Como Testar:

1. **Reiniciar o servidor Next.js**:
   ```bash
   # Parar com Ctrl+C se estiver rodando
   npm run dev
   ```

2. **Abrir o navegador**:
   - Acesse `http://localhost:3000`
   - Entre no perfil de um paciente

3. **Abrir o Console do Navegador** (F12):
   - Aba "Console" - para ver os logs de debug

4. **Testar a transcrição**:
   - Clique no botão flutuante roxo (canto inferior direito)
   - Permita acesso ao microfone quando solicitado
   - Fale algumas palavras
   - Aguarde 5 segundos (tempo do chunk)
   - Verifique se o texto aparece
   - Clique em "Parar Transcrição"

5. **Verificar os logs** no console:
   - Deve mostrar todos os passos da transcrição
   - Se houver erro, o log mostrará onde falhou

---

## Possíveis Problemas e Soluções:

### Problema 1: Botão fica inativo (disabled)

**Causa**: Estado `isProcessing` não está sendo resetado

**Verificação**:
- Abra o console e veja se aparece: `[Transcrição] Finalizando processamento`
- Se NÃO aparecer, o processamento travou em algum lugar

**Solução**:
- Verifique a conexão com o Modal
- Verifique se o endpoint está correto no `.env.local`
- Teste manualmente o endpoint do Modal

### Problema 2: Erro 500 da API

**Causa**: Modal não está respondendo ou erro no formato

**Verificação**:
- Veja o log no console: `[Transcrição] Erro da API: [mensagem]`
- Acesse o dashboard do Modal: https://modal.com/apps

**Solução**:
- Verifique se o endpoint está online no Modal
- Verifique se a URL no `.env.local` está correta

### Problema 3: Não pede permissão do microfone

**Causa**: Permissão já foi negada anteriormente

**Solução**:
- Abra as configurações do navegador
- Vá em Privacidade e Segurança → Configurações do site
- Permita acesso ao microfone para `localhost:3000`

---

## Arquivos Modificados:

1. `src/app/api/transcribe/route.ts` - Correção do envio e idioma fixo
2. `src/hooks/useTranscription.ts` - Adição de logs de debug

---

## Endpoint do Modal:

```
https://arthurgabriel-birer--whisperx-transcription-fastapi-app.modal.run/transcribe
```

**Dashboard**: https://modal.com/apps/arthurgabriel-birer/main/deployed/whisperx-transcription

---

## Teste Manual do Endpoint:

Para testar se o Modal está funcionando:

```bash
# Windows PowerShell
$audioFile = "caminho/para/audio.webm"
$form = @{
    audio_file = Get-Item -Path $audioFile
    language = "pt"
}
Invoke-RestMethod -Uri "https://arthurgabriel-birer--whisperx-transcription-fastapi-app.modal.run/transcribe" -Method Post -Form $form
```

Deve retornar um JSON com:
```json
{
  "success": true,
  "text": "texto transcrito",
  "segments": [...],
  "language": "pt",
  "duration": 5.2
}
```

---

## Próximos Passos:

Após testar:

1. Se funcionar ✅:
   - Remover os logs de debug (opcional)
   - Documentar para o usuário

2. Se NÃO funcionar ❌:
   - Compartilhar os logs do console
   - Verificar se o Modal está online
   - Testar com áudio de exemplo

---

**Status**: Correções aplicadas, aguardando teste do usuário.
