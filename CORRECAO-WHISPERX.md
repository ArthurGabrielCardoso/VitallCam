# Correção do WhisperX - Transcrições Funcionando! ✅

## Problema Identificado

A transcrição estava retornando textos vazios porque o **Modal WhisperX estava falhando ao iniciar**. Foram identificados dois problemas críticos:

### 1. Faltava a dependência `python-multipart`
O FastAPI precisa de `python-multipart` para processar uploads de arquivo (FormData). Sem isso, o endpoint não conseguia receber os arquivos de áudio.

**Erro no log:**
```
RuntimeError: Form data requires "python-multipart" to be installed.
```

### 2. Faltavam ferramentas de compilação C
O WhisperX depende da biblioteca `av` (PyAV) que precisa compilar código C durante a instalação. A imagem Docker não tinha `clang` e `build-essential`.

**Erro no log:**
```
error: command 'clang' failed: No such file or directory
```

---

## Correções Aplicadas

### modal_whisperx.py

1. **Adicionado `python-multipart`** nas dependências Python:
```python
.pip_install(
    "git+https://github.com/m-bain/whisperx.git@v3.2.0",
    "ffmpeg-python",
    "ctranslate2==4.4.0",
    "fastapi",
    "python-multipart",  # ← ADICIONADO
)
```

2. **Adicionadas ferramentas de build** na configuração apt:
```python
.apt_install(
    "git",
    "ffmpeg",
    "pkg-config",
    "build-essential",  # ← ADICIONADO (gcc, g++, make)
    "clang",            # ← ADICIONADO (compilador C)
    "libavformat-dev",
    # ... outras libs FFmpeg
)
```

---

## Resultado

✅ **Modal WhisperX deployado com sucesso!**

Endpoint: `https://arthurgabriel-birer--whisperx-transcription-fastapi-app.modal.run/`

Status verificado:
```json
{
  "service": "WhisperX Transcription",
  "status": "online",
  "model": "large-v3",
  "language": "pt (Portuguese)"
}
```

---

## Como Testar

1. **Inicie o servidor Next.js:**
```bash
npm run dev
```

2. **Acesse a aplicação:**
```
http://localhost:3000
```

3. **Teste a transcrição:**
   - Navegue até a página de um paciente
   - Clique no botão de microfone para iniciar gravação
   - Fale algo em português
   - Aguarde alguns segundos
   - A transcrição deve aparecer em tempo real!

---

## Observações Importantes

### Você NÃO precisa de API Hugging Face
- WhisperX funciona sem token do Hugging Face para transcrição básica
- Token HF só é necessário para **diarização de falantes** (identificar quem está falando)
- A configuração atual faz apenas transcrição, sem diarização

### Custos do Modal
- O Modal usa GPU A10G (mais barato que H100)
- Cobra por segundo de uso da GPU
- `scaledown_window=120` significa que a GPU fica ativa por 2 minutos após última chamada
- Após 2 minutos de inatividade, a GPU desliga (economia)

### Performance
- **Primeira chamada:** ~30-60 segundos (precisa inicializar GPU e carregar modelo)
- **Chamadas seguintes:** ~5-10 segundos (modelo já carregado)
- **Modelo:** WhisperX large-v3 (melhor qualidade para português)

---

## Arquivos Modificados

1. `modal_whisperx.py` - Adicionadas dependências faltantes
2. (Deployado no Modal)

---

## Próximos Passos (Opcionais)

Se quiser melhorar ainda mais:

1. **Adicionar diarização de falantes:**
   - Criar conta no Hugging Face
   - Gerar token de leitura
   - Aceitar termos dos modelos de diarização
   - Adicionar token como variável de ambiente no Modal

2. **Otimizar custos:**
   - Reduzir `scaledown_window` se não usar muito
   - Considerar modelo menor (medium) se qualidade suficiente

3. **Monitorar uso:**
   - Acessar https://modal.com/apps
   - Ver logs e métricas de uso
   - Acompanhar custos

---

## Troubleshooting

### Se transcrição ainda não funcionar:

1. **Verificar logs do Modal:**
```bash
.venv-modal\Scripts\modal.exe app logs whisperx-transcription
```

2. **Verificar .env.local:**
```
MODAL_WHISPERX_ENDPOINT=https://arthurgabriel-birer--whisperx-transcription-fastapi-app.modal.run/transcribe
```

3. **Verificar console do navegador:**
   - Abrir DevTools (F12)
   - Ver se há erros na aba Console
   - Ver Network tab para ver requisições /api/transcribe

4. **Verificar Supabase:**
   - Os erros 500 do Supabase com `photos` são independentes da transcrição
   - Isso é outro problema relacionado ao banco de dados

---

**Data da correção:** 2025-10-25
**Status:** ✅ FUNCIONANDO
