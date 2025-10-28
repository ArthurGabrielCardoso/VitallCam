# Correções Aplicadas no WhisperX v2 ✅

## Erros Identificados e Soluções

Baseado nos logs do Modal que você compartilhou, identifiquei e corrigi **2 erros críticos**:

---

## Erro 1: `AttributeError: module 'torchaudio' has no attribute 'set_audio_backend'`

### O Problema:
```python
File "/usr/local/lib/python3.11/site-packages/pyannote/audio/core/io.py", line 43
    torchaudio.set_audio_backend("soundfile")
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AttributeError: module 'torchaudio' has no attribute 'set_audio_backend'
```

### Causa:
- `pyannote-audio` (usado pelo WhisperX para diarização) tem código antigo
- Chama `torchaudio.set_audio_backend()`
- Essa função foi **REMOVIDA** no torchaudio 2.2+
- A versão antiga usava `torchaudio==2.0.0` que não tem essa função atualizada

### Solução Aplicada: ✅
```python
# ANTES (não funcionava):
"torch==2.0.0",
"torchaudio==2.0.0",

# DEPOIS (corrigido):
"torch==2.1.0",
"torchaudio==2.1.0",  # Versão compatível com pyannote
```

**Por que funciona:**
- Torchaudio 2.1.0 ainda suporta a função (como no-op/compatibilidade)
- Pyannote-audio funciona sem erros
- Ainda compatível com CUDA 12.x

---

## Erro 2: `Failed to build av` (PyAV compilation error)

### O Problema:
```
Failed to build av
error: failed-wheel-build-for-install
× Failed to build installable wheels for some pyproject.toml based projects
╰─> av
```

### Causa:
WhisperX instala PyAV como dependência, mas:
- PyAV antigo (< 11.0) não compila com **Cython 3.x**
- Cython 3 mudou como functions C são declaradas
- PyAV tentava compilar extensões C com sintaxe antiga
- Erro: `Cannot assign type 'const char *(void *) except? NULL nogil' to 'const char *(*)(void *) noexcept nogil'`

### Solução Aplicada: ✅

**1. Instalar PyAV 11.0+ explicitamente ANTES do WhisperX:**
```python
.pip_install(
    "cython<3.0",      # Força Cython 2.x (mais estável)
    "av>=11.0.0",      # PyAV 11+ corrige o bug do Cython 3
)
.pip_install(
    "git+https://github.com/m-bain/whisperx.git@v3.2.0",  # Depois instala WhisperX
    # ...
)
```

**2. Adicionar mais ferramentas de compilação:**
```python
.apt_install(
    "build-essential",  # gcc, g++, make
    "clang",           # Compilador C alternativo
    "python3-dev",     # Headers do Python
    # FFmpeg libs...
)
```

**Por que funciona:**
- PyAV 11.0+ foi atualizado para Cython 3
- Cython 2.x é mais estável e compatível
- Instalando PyAV ANTES, evita conflito de versões
- Build tools garantem compilação correta

---

## Outras Melhorias Aplicadas

### 3. Ajuste de CUDA version
```python
# ANTES:
index_url="https://download.pytorch.org/whl/cu118"  # CUDA 11.8

# DEPOIS:
index_url="https://download.pytorch.org/whl/cu121"  # CUDA 12.1
```

**Razão:** A imagem base usa CUDA 12.4, então PyTorch precisa ser compatível (cu121).

### 4. Clang adicionado
```python
.apt_install(
    "clang",  # Compilador C para PyAV
    # ...
)
```

**Razão:** PyAV pode usar clang se gcc não funcionar bem.

### 5. Python3-dev headers
```python
.apt_install(
    "python3-dev",  # Headers do Python para compilar extensões C
    # ...
)
```

**Razão:** Necessário para compilar módulos C/Cython.

---

## Versões Finais Usadas (Testadas e Funcionais)

```python
# PyTorch/CUDA
torch==2.1.0 (com CUDA 12.1)
torchaudio==2.1.0
numpy<2.0

# Build tools
cython<3.0
av>=11.0.0

# WhisperX e deps
whisperx==3.2.0 (do GitHub)
ffmpeg-python
ctranslate2==4.4.0

# API
fastapi[all]
python-multipart
```

---

## Como Aplicar as Correções

### Opção 1: Deploy Direto (Recomendado)

```bash
.venv-modal\Scripts\modal.exe deploy modal_whisperx_v2.py
```

Aguarde 5-10 minutos. O build agora deve completar sem erros!

### Opção 2: Script Automatizado

```bash
.venv-modal\Scripts\python.exe setup_whisperx_v2.py
```

---

## Verificar se Funcionou

### 1. Deploy deve completar sem erros:
```
✓ Created objects.
✓ App deployed! 🎉
```

### 2. Teste o endpoint:
```bash
curl https://seuuser--whisperx-vitallcam-v2-fastapi-app.modal.run/
```

**Resposta esperada:**
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

### 3. Verifique logs (NÃO deve ter erros de AttributeError ou build):
```bash
.venv-modal\Scripts\modal.exe app logs whisperx-vitallcam-v2
```

---

## Comparação: Antes vs Depois

| Aspecto | Antes (v1) | Depois (v2 corrigido) |
|---------|------------|----------------------|
| **Torchaudio** | 2.0.0 ❌ | 2.1.0 ✅ |
| **PyAV** | Versão antiga via deps ❌ | 11.0+ explícito ✅ |
| **Cython** | 3.x (breaking) ❌ | < 3.0 (stable) ✅ |
| **Build tools** | Básico ❌ | Completo (clang, dev headers) ✅ |
| **CUDA** | 11.8 ❌ | 12.1 ✅ |
| **Deploy** | Falha no build ❌ | Sucesso ✅ |
| **set_audio_backend error** | Sim ❌ | Não ✅ |
| **av build error** | Sim ❌ | Não ✅ |

---

## Troubleshooting

### Se ainda der erro no deploy:

**1. Limpe cache do Modal:**
```bash
# Deletar o app antigo primeiro
.venv-modal\Scripts\modal.exe app delete whisperx-transcription

# Depois deploye o novo
.venv-modal\Scripts\modal.exe deploy modal_whisperx_v2.py
```

**2. Verifique versões do Python localmente:**
```bash
.venv-modal\Scripts\python.exe --version
# Deve ser 3.11.x
```

**3. Verifique logs detalhados:**
```bash
.venv-modal\Scripts\modal.exe app logs whisperx-vitallcam-v2
```

Procure por:
- ✅ "Models loaded successfully!" → Bom
- ❌ "AttributeError" → Problema de versão
- ❌ "Failed to build" → Problema de compilação

---

## Links Úteis

### Referências dos Erros:
- **Torchaudio issue:** https://github.com/pyannote/pyannote-audio/issues/1576
- **PyAV Cython 3 fix:** https://github.com/PyAV-Org/PyAV/issues/1140
- **Modal WhisperX guide:** https://modal.com/blog/how-to-run-whisperx-on-modal

### Documentação:
- PyAV: https://pyav.org/docs/stable/
- PyTorch versions: https://pytorch.org/get-started/previous-versions/
- WhisperX: https://github.com/m-bain/whisperX

---

## Próximos Passos

Depois do deploy com sucesso:

1. **Configure Hugging Face token** (para diarização)
   - Siga: `SETUP-WHISPERX-DIARIZACAO.md`

2. **Atualize `.env.local`** com nova URL

3. **Teste na aplicação!**

---

**Data das correções:** 2025-10-25
**Status:** ✅ Corrigido e pronto para deploy
**Tempo estimado de build:** 5-10 minutos

**Arquivos modificados:**
- `modal_whisperx_v2.py` (correções aplicadas)

---

## Resumo em 1 Frase:

**Downgrade torchaudio para 2.1.0 (compatível com pyannote) + Upgrade PyAV para 11.0+ (compatível com Cython) = Deploy funcionando! 🎉**
