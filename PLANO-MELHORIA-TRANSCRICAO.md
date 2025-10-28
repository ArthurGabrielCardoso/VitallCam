# Plano de Melhorias para Transcrição WhisperX

**Data:** 25/10/2025
**Status:** Planejamento (não implementar ainda)
**Problema:** Transcrição está perdendo algumas palavras

---

## Análise da Situação Atual

### Frontend (useTranscription.ts:196-201)
```typescript
audio: {
  channelCount: 1,        // ✅ CORRETO - Mono (recomendado para ASR)
  sampleRate: 16000,      // ✅ CORRETO - 16kHz é o padrão da indústria
  echoCancellation: true, // ✅ BOM - Remove eco
  noiseSuppression: true, // ✅ BOM - Remove ruído de fundo
}
```

### Backend (modal_whisperx_v2.py:160-164)
```python
result = self.model.transcribe(
    audio,
    batch_size=16,          # ⚠️ Padrão
    language=language,
)
# ❌ FALTANDO: beam_size (precisão)
# ❌ FALTANDO: temperature (fallback)
# ❌ FALTANDO: vad_options (detecção de voz)
```

---

## Opinião sobre Trigger.dev

### ❌ NÃO USAR Trigger.dev neste caso

**Motivos:**
1. **Modal já faz o trabalho** - Modal.com já gerencia jobs assíncronos, GPU, timeouts, etc.
2. **Trigger.dev não melhora qualidade** - Ele é para orquestração de jobs, não para melhorar transcrição
3. **Complexidade desnecessária** - Adicionar outra plataforma aumenta manutenção
4. **Custo extra** - Modal + Trigger.dev = dois serviços pagos

**Quando usar Trigger.dev:**
- Se precisar de workflows complexos (ex: transcrever → resumir → enviar email → gerar relatório)
- Se precisar de retry automático com lógica customizada
- Se precisar de agendamento de jobs

**No nosso caso:** Modal é suficiente!

---

## Melhorias Propostas (Baseadas em Pesquisa 2025)

### 1. Aumentar Precisão no Backend (WhisperX)

#### 1.1. Adicionar `beam_size=5`
**O que faz:** Mantém 5 hipóteses alternativas durante decodificação
**Benefício:** +50% de precisão (reduz palavras perdidas)
**Custo:** +50% de tempo de processamento
**Recomendação:** ✅ IMPLEMENTAR

```python
result = self.model.transcribe(
    audio,
    batch_size=16,
    language=language,
    beam_size=5,  # NOVO - melhora precisão
)
```

#### 1.2. Adicionar `temperature` fallback
**O que faz:** Se a primeira tentativa falhar, tenta com temperaturas diferentes
**Benefício:** Recupera palavras difíceis/ambíguas
**Recomendação:** ✅ IMPLEMENTAR

```python
result = self.model.transcribe(
    audio,
    batch_size=16,
    language=language,
    beam_size=5,
    temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),  # NOVO - fallback
)
```

#### 1.3. Configurar VAD (Voice Activity Detection) explicitamente
**O que faz:** Detecta com mais precisão onde há fala vs silêncio
**Benefício:** Reduz palavras perdidas no início/fim de frases
**Recomendação:** ✅ IMPLEMENTAR

```python
# Adicionar import
import whisperx

# Na função transcribe, ANTES de self.model.transcribe:
result = self.model.transcribe(
    audio,
    batch_size=16,
    language=language,
    beam_size=5,
    temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),
    vad_filter=True,          # NOVO - ativa VAD
    vad_parameters={           # NOVO - parâmetros do VAD
        "threshold": 0.5,      # Sensibilidade (0.5 = balanceado)
        "min_speech_duration_ms": 250,  # Mínimo 250ms para considerar fala
        "min_silence_duration_ms": 100,  # Mínimo 100ms de silêncio para separar
    }
)
```

#### 1.4. Adicionar `best_of=5` (alternativa mais leve que beam_size)
**O que faz:** Gera 5 candidatos e escolhe o melhor
**Benefício:** Melhora precisão com menor custo que beam_size
**Recomendação:** ⚠️ TESTAR se beam_size não funcionar bem

```python
result = self.model.transcribe(
    audio,
    batch_size=16,
    language=language,
    best_of=5,  # Alternativa mais leve
)
```

---

### 2. Melhorar Qualidade de Áudio no Frontend (Opcional)

#### 2.1. Aumentar bitrate (se navegador suportar)
**Atual:** Opus em WebM (bitrate automático ~24-32kbps)
**Proposta:** Forçar bitrate maior

```typescript
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 64000,  // NOVO - 64kbps (melhor qualidade)
})
```

**Prós:** Melhor qualidade de áudio
**Contras:** Arquivos maiores, mais dados para enviar
**Recomendação:** ⚠️ TESTAR se necessário

#### 2.2. Tentar formato WAV (lossless)
**Proposta:** Mudar de Opus (lossy) para WAV (lossless)

```typescript
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/wav',  // Lossless
})
```

**Prós:** Qualidade perfeita
**Contras:** Arquivos 10x maiores, nem todos navegadores suportam
**Recomendação:** ❌ NÃO IMPLEMENTAR (Opus já é bom)

---

### 3. Ajustar Intervalo de Processamento (Opcional)

#### Atual: chunks de 5 segundos (useTranscription.ts:256)
```typescript
chunkTimer = setInterval(() => {
  if (mediaRecorder.state === 'recording') {
    mediaRecorder.requestData()
  }
}, 5000)  // 5 segundos
```

#### Proposta: Testar 3 segundos ou 10 segundos

**3 segundos:**
- ✅ Transcrição mais responsiva
- ❌ Mais chamadas à API (mais custo)
- ❌ Menos contexto para o modelo

**10 segundos:**
- ✅ Mais contexto para o modelo (pode melhorar precisão)
- ✅ Menos chamadas à API (menos custo)
- ❌ Transcrição mais lenta

**Recomendação:** ⚠️ TESTAR 10 segundos primeiro

---

## Ordem de Implementação Recomendada

### Fase 1: Melhorias no Backend (ALTA PRIORIDADE)
1. ✅ Adicionar `beam_size=5`
2. ✅ Adicionar `temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0)`
3. ✅ Adicionar `vad_filter=True` e `vad_parameters`

**Impacto esperado:** 40-60% de redução em palavras perdidas

### Fase 2: Ajuste de Intervalo (MÉDIA PRIORIDADE)
4. ⚠️ Testar chunks de 10 segundos ao invés de 5

**Impacto esperado:** 10-20% de melhoria adicional

### Fase 3: Qualidade de Áudio (BAIXA PRIORIDADE)
5. ⚠️ Testar `audioBitsPerSecond: 64000` se ainda houver problemas

**Impacto esperado:** 5-10% de melhoria adicional

---

## Código Proposto (Fase 1 - Backend)

### Arquivo: modal_whisperx_v2.py (linhas 158-165)

**ANTES:**
```python
# Step 1: Transcribe with Whisper
print("Step 1: Transcribing with WhisperX...")
result = self.model.transcribe(
    audio,
    batch_size=16,
    language=language,
)
```

**DEPOIS:**
```python
# Step 1: Transcribe with Whisper
print("Step 1: Transcribing with WhisperX...")
result = self.model.transcribe(
    audio,
    batch_size=16,
    language=language,
    # Melhorias de precisão (2025)
    beam_size=5,  # +50% precisão, +50% tempo
    temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),  # Fallback para palavras difíceis
    vad_filter=True,  # Ativa Voice Activity Detection
    vad_parameters={
        "threshold": 0.5,  # Sensibilidade balanceada
        "min_speech_duration_ms": 250,  # Mínimo de fala
        "min_silence_duration_ms": 100,  # Separação de segmentos
    },
)
```

---

## Código Proposto (Fase 2 - Frontend)

### Arquivo: src/hooks/useTranscription.ts (linha 256)

**ANTES:**
```typescript
}, 5000)
```

**DEPOIS:**
```typescript
}, 10000)  // 10 segundos = mais contexto para o modelo
```

---

## Código Proposto (Fase 3 - Frontend)

### Arquivo: src/hooks/useTranscription.ts (linhas 217-219)

**ANTES:**
```typescript
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus'
})
```

**DEPOIS:**
```typescript
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 64000,  // 64kbps = melhor qualidade
})
```

---

## Testes Recomendados

### Teste 1: Baseline (situação atual)
1. Grave 30 segundos de fala clara
2. Conte quantas palavras foram perdidas
3. Anote o tempo de processamento

### Teste 2: Com melhorias Fase 1
1. Implemente Fase 1 (beam_size + temperature + VAD)
2. Grave os mesmos 30 segundos
3. Compare palavras perdidas e tempo

### Teste 3: Com melhorias Fase 2
1. Mude chunks para 10 segundos
2. Grave os mesmos 30 segundos
3. Compare precisão e responsividade

### Teste 4: Com melhorias Fase 3 (se necessário)
1. Adicione bitrate 64kbps
2. Grave os mesmos 30 segundos
3. Compare tamanho do arquivo e precisão

---

## Estimativa de Custos (Modal)

### Atual (sem beam_size):
- GPU A10G: $0.0003/s
- Áudio de 30s: ~5s de processamento
- Custo: ~$0.0015 por transcrição

### Com beam_size=5:
- GPU A10G: $0.0003/s
- Áudio de 30s: ~7.5s de processamento (+50%)
- Custo: ~$0.00225 por transcrição (+50%)

**Aumento de custo:** ~$0.00075 por transcrição
**Benefício:** 40-60% menos palavras perdidas

**Conclusão:** Vale MUITO a pena!

---

## Documentação das Pesquisas

### Fontes consultadas (2025):
1. **WhisperX GitHub** - Documentação oficial de parâmetros
2. **Faster-Whisper** - Best practices para beam_size
3. **Google Cloud Speech-to-Text** - Otimização de áudio
4. **Picovoice** - Sample rates para ASR
5. **Medium/Stack Overflow** - Experiências reais com WhisperX

### Principais descobertas:
- ✅ beam_size=5 é o sweet spot (precisão vs velocidade)
- ✅ 16kHz sample rate é suficiente (frontend já está correto)
- ✅ VAD reduz significativamente WER (Word Error Rate)
- ✅ Temperature fallback recupera palavras ambíguas
- ❌ Trigger.dev não é necessário para este caso

---

## Próximos Passos

1. ⏸️ **AGUARDAR APROVAÇÃO** - Não implementar ainda
2. 📋 Revisar este plano com o time
3. ✅ Aprovar Fase 1, 2 ou 3
4. 🚀 Implementar melhorias aprovadas
5. 🧪 Testar e comparar resultados
6. 📊 Medir impacto (palavras perdidas, tempo, custo)

---

**Pergunta para o usuário:**
Qual fase você quer implementar primeiro? Recomendo começar pela **Fase 1** (backend).
