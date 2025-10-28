# Instruções para Deploy Manual do WhisperX

**Problema identificado:** NumPy 2.3.4 estava sendo instalado (deve ser 1.26.4)

**Solução aplicada:** Arquivo `modal_whisperx_v2.py` está corrigido e pronto para deploy!

---

## O que foi corrigido no código:

### 1. NumPy forçado para 1.x
```python
.pip_install(
    "numpy<2",  # IMPEDE qualquer dependência de fazer upgrade para 2.x
    "git+https://github.com/m-bain/whisperx.git@v3.2.0",
    ...
)
```

### 2. Verificação de versão no startup
```python
print(f"[CHECK] NumPy version: {np.__version__}")
if np.__version__.startswith("2."):
    raise RuntimeError(f"[ERROR] NumPy 2.x detected! Must be 1.x")
```

### 3. Nome do app atualizado
```python
app = modal.App("whisperx-vitallcam-v2-final")
```

### 4. Todos os emojis removidos (compatibilidade Windows)
- Substituídos por [OK], [ERROR], [WARN], etc.

---

## Como fazer o deploy manual:

### Opção 1: Via Dashboard Web do Modal (MAIS FÁCIL)

1. Acesse: https://modal.com/apps
2. Faça login
3. Clique em "New App" ou botão de deploy
4. Faça upload do arquivo `modal_whisperx_v2.py`
5. O Modal vai fazer o build automaticamente
6. Após deploy, a URL será:
   ```
   https://arthurgabriel-birer--whisperx-vitallcam-v2-final-fastapi-app.modal.run/
   ```

### Opção 2: Via CLI do Modal (se conseguir)

No PowerShell ou CMD:

```bash
.venv-modal\Scripts\modal.exe deploy modal_whisperx_v2.py
```

**Nota:** Pode dar erros de encoding no Windows, mas o deploy pode funcionar mesmo assim. Verifique o dashboard.

### Opção 3: Via WSL (Windows Subsystem for Linux)

Se você tem WSL instalado:

```bash
# No WSL
cd /mnt/c/Users/Artur/Desktop/VitallCam
modal deploy modal_whisperx_v2.py
```

---

## Após o deploy bem-sucedido:

### 1. Verifique se está online:

Acesse no navegador:
```
https://arthurgabriel-birer--whisperx-vitallcam-v2-final-fastapi-app.modal.run/
```

Deve retornar:
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

### 2. Verifique a versão do NumPy:

```
https://arthurgabriel-birer--whisperx-vitallcam-v2-final-fastapi-app.modal.run/health
```

Deve retornar:
```json
{
  "status": "healthy",
  "cuda_available": false,
  "hf_token_configured": true,
  "numpy_version": "1.26.4"  // <-- DEVE SER 1.26.x, NÃO 2.x!
}
```

### 3. Atualize o .env.local:

Abra o arquivo `.env.local` e MUDE a linha:

**DE:**
```
MODAL_WHISPERX_ENDPOINT=https://arthurgabriel-birer--whisperx-vitallcam-v2-fastapi-app.modal.run/transcribe
```

**PARA:**
```
MODAL_WHISPERX_ENDPOINT=https://arthurgabriel-birer--whisperx-vitallcam-v2-final-fastapi-app.modal.run/transcribe
```

**Nota:** O nome mudou de `v2` para `v2-final`

### 4. Reinicie o servidor Next.js:

```bash
# Pare o servidor (Ctrl+C)
# Reinicie:
npm run dev
```

### 5. Teste a transcrição:

1. Acesse http://localhost:3000
2. Vá até um paciente
3. Clique no microfone
4. Fale algo
5. Aguarde 30-60 segundos (primeira vez é lenta, cold start)
6. Transcrição deve aparecer!

---

## Como verificar se NumPy está correto:

### Via Dashboard Modal:

1. Acesse: https://modal.com/apps
2. Clique em `whisperx-vitallcam-v2-final`
3. Vá na aba "Logs" ou "Calls"
4. Procure pela mensagem:
   ```
   [CHECK] NumPy version: 1.26.4
   ```
5. **NÃO DEVE APARECER:** `NumPy 2.3.4` ou qualquer 2.x

### Se aparecer erro de NumPy 2.x:

Significa que o cache do Modal não foi limpo. Tente:
1. Deletar o app antigo no dashboard
2. Re-deployar com nome diferente
3. Ou esperar algumas horas para o cache expirar

---

## Arquivos importantes:

### Para deploy:
- **`modal_whisperx_v2.py`** - Código corrigido (USE ESTE!)
- ~~`modal_whisperx_v3.py`~~ - Tentativa alternativa (ignore)

### Documentação:
- `SUCESSO-FINAL-WHISPERX.md` - Documentação da versão anterior (referência)
- `COMO-VER-LOGS-MODAL.md` - Como ver logs no Modal
- Este arquivo - Instruções de deploy manual

---

## Troubleshooting:

### Transcrição ainda vazia após deploy?

**1. Verifique o endpoint no .env.local:**
```bash
# Deve terminar com /transcribe
MODAL_WHISPERX_ENDPOINT=https://...whisperx-vitallcam-v2-final-fastapi-app.modal.run/transcribe
```

**2. Verifique logs do Modal:**
- Acesse https://modal.com/apps
- Clique no app
- Vá em "Calls" ou "Logs"
- Procure por erros

**3. Verifique console do navegador (F12):**
```
[Transcrição] Enviando para API...
[Transcrição] Resposta recebida: 200
```

Se aparecer 500 ou timeout, problema é no Modal.

### Como saber se o NumPy está correto?

Teste o endpoint `/health`:
```bash
curl https://arthurgabriel-birer--whisperx-vitallcam-v2-final-fastapi-app.modal.run/health
```

Procure por: `"numpy_version": "1.26.4"`

Se aparecer `"numpy_version": "2.3.4"` ou qualquer 2.x, o problema persiste.

---

## Resumo do que está pronto:

✅ Código corrigido (`modal_whisperx_v2.py`)
✅ NumPy 1.26.4 forçado
✅ Verificação de versão adicionada
✅ Emojis removidos (compatibilidade Windows)
✅ Nome do app atualizado para evitar cache
✅ Modal 1.0 API atualizada

**Próximo passo:** Você fazer o deploy manual via dashboard ou CLI!

---

**Quando o deploy funcionar, me avise para ajudar a testar! 🚀**
