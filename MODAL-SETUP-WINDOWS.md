# Configuração do Modal no Windows - Guia Passo a Passo

## 📋 Pré-requisitos

Você precisa instalar o Python primeiro. Siga os passos abaixo:

## 1️⃣ Instalar Python

1. **Baixar Python**:
   - Acesse: https://www.python.org/downloads/
   - Baixe a versão mais recente do Python (3.11 ou superior)

2. **Instalar**:
   - Execute o instalador
   - ⚠️ **IMPORTANTE**: Marque a opção "Add Python to PATH"
   - Clique em "Install Now"

3. **Verificar instalação**:
   - Abra um NOVO terminal (PowerShell ou CMD)
   - Execute:
   ```bash
   python --version
   ```
   - Deve mostrar algo como: `Python 3.11.x`

## 2️⃣ Instalar Modal CLI

No terminal, execute:

```bash
pip install modal
```

Aguarde a instalação completar.

## 3️⃣ Autenticar com Modal

1. **Criar conta no Modal** (se ainda não tem):
   - Acesse: https://modal.com
   - Clique em "Sign Up"
   - Pode usar GitHub ou Google para login rápido

2. **Autenticar CLI**:
   ```bash
   modal token new
   ```

   Isso vai:
   - Abrir seu navegador
   - Pedir para fazer login no Modal
   - Gerar um token de autenticação
   - Salvar automaticamente na sua máquina

## 4️⃣ Deploy do Servidor WhisperX

No terminal, navegue até a pasta do projeto:

```bash
cd C:\Users\Artur\Desktop\VitallCam
```

Faça o deploy:

```bash
modal deploy modal_whisperx.py
```

⏳ **Aguarde**: O primeiro deploy pode levar 5-10 minutos pois:
- Modal vai criar a imagem Docker
- Instalar WhisperX e todas as dependências
- Baixar o modelo Whisper large-v3 (~3GB)

✅ **Sucesso**: Você verá uma mensagem como:

```
✓ Created web function transcribe_endpoint.
View Deployment: https://modal.com/apps/...

Web endpoints:
  https://seu-usuario--whisperx-transcription-transcribe-endpoint.modal.run
```

**📋 COPIE ESTA URL!** Você vai precisar dela.

## 5️⃣ Configurar Variável de Ambiente

1. **Abrir arquivo .env.local**:
   - No VS Code, abra o arquivo `.env.local`
   - Se não existir, crie um novo arquivo com este nome na raiz do projeto

2. **Adicionar a URL do Modal**:
   ```env
   MODAL_WHISPERX_ENDPOINT=https://seu-usuario--whisperx-transcription-transcribe-endpoint.modal.run
   ```

   ⚠️ Substitua pela URL que você copiou no passo anterior

3. **Salvar o arquivo**

## 6️⃣ Reiniciar Servidor Next.js

1. **Parar o servidor** (se estiver rodando):
   - Pressione `Ctrl+C` no terminal onde o Next está rodando

2. **Iniciar novamente**:
   ```bash
   npm run dev
   ```

## 7️⃣ Testar a Transcrição

1. Abra o app no navegador: http://localhost:3000
2. Entre no perfil de um paciente
3. Procure o **botão flutuante de transcrição** no canto inferior direito
4. Clique em "Iniciar Transcrição"
5. Permita acesso ao microfone
6. Comece a falar!
7. O texto deve aparecer em tempo real 🎉

## 🔍 Troubleshooting

### Erro: "Python não encontrado"
- Reinstale o Python marcando "Add to PATH"
- Feche e abra um NOVO terminal
- Tente novamente

### Erro: "modal: comando não encontrado"
Execute:
```bash
pip install --user modal
```

Depois, adicione Python Scripts ao PATH:
- Vá em Variáveis de Ambiente do Windows
- Adicione: `C:\Users\Artur\AppData\Local\Programs\Python\Python311\Scripts`

### Erro durante deploy: "Authentication failed"
Execute novamente:
```bash
modal token new
```

### Deploy fica travado
- Verifique sua conexão com internet
- O primeiro deploy é LENTO (pode levar 10+ minutos)
- Seja paciente! 😊

### "Modal endpoint not configured"
- Verifique se a URL está correta em `.env.local`
- Verifique se reiniciou o servidor Next.js
- A URL deve começar com `https://`

## 📊 Monitoramento

Depois do deploy, você pode monitorar em:

https://modal.com/apps

Lá você verá:
- Logs em tempo real
- Uso de GPU
- Custos
- Tempo de resposta

## 💰 Custos

Modal oferece:
- **$30 grátis por mês**
- GPU A10G: ~$0.0006/segundo
- **Estimativa**: ~1000+ minutos de transcrição GRÁTIS por mês

## 🎯 Comandos Úteis

```bash
# Ver apps deployados
modal app list

# Ver logs em tempo real
modal app logs whisperx-transcription

# Atualizar código
modal deploy modal_whisperx.py

# Rodar localmente para testes
modal serve modal_whisperx.py

# Deletar app
modal app stop whisperx-transcription
```

## ✅ Checklist Final

- [ ] Python instalado e no PATH
- [ ] Modal CLI instalado (`pip install modal`)
- [ ] Autenticado no Modal (`modal token new`)
- [ ] Deploy feito (`modal deploy modal_whisperx.py`)
- [ ] URL copiada e colada em `.env.local`
- [ ] Servidor Next.js reiniciado
- [ ] Testado no navegador

---

**Pronto!** Seu sistema de transcrição está configurado e rodando! 🚀

---

## 🎤 Como Funciona a Transcrição

### Fluxo de Dados

```
[Microfone do Navegador]
        ↓
[Captura de Áudio (5s chunks)]
        ↓
[Next.js API Route: /api/transcribe]
        ↓
[Modal WhisperX Endpoint (GPU)]
        ↓
[Modelo Whisper large-v3]
        ↓
[Alinhamento de Palavras]
        ↓
[Banco Supabase]
        ↓
[Exibição em Tempo Real]
```

### Características Técnicas

- **Modelo**: WhisperX com Whisper large-v3 (melhor qualidade)
- **GPU**: NVIDIA A10G (via Modal)
- **Idioma**: Português (PT-BR) por padrão
- **Chunks**: Áudio enviado a cada 5 segundos
- **Alinhamento**: Word-level timestamps (precisão ao nível de palavra)
- **Formato**: WebM/Opus → convertido automaticamente

### Dados Salvos no Banco

Cada transcrição cria:

1. **Registro de Transcrição** (`transcriptions`):
   - ID único
   - ID do paciente
   - Texto completo
   - Horário início/fim
   - Duração total
   - Status

2. **Segmentos** (`transcription_segments`):
   - Texto de cada segmento
   - Timestamp início/fim
   - Confiança (accuracy)
   - Sequência numérica

---

## 🔧 Configurações Avançadas

### Alterar Idioma da Transcrição

No arquivo `src/app/api/transcribe/route.ts`, altere:

```typescript
// Português (padrão)
language: 'pt'

// Inglês
language: 'en'

// Espanhol
language: 'es'

// Francês
language: 'fr'
```

### Habilitar Diarização de Speakers

Para identificar quem está falando (dentista vs. paciente):

1. **Obter token HuggingFace**:
   - Acesse: https://huggingface.co/settings/tokens
   - Crie um token com permissão de leitura

2. **Adicionar ao Modal**:
   ```bash
   modal secret create whisperx-secrets HF_TOKEN=seu_token_aqui
   ```

3. **Atualizar chamada da API**:
   ```typescript
   const result = await transcriber.transcribe.remote(
     audioBlob,
     language,
     16, // batch_size
     true, // enable_diarization
     process.env.HF_TOKEN
   )
   ```

### Ajustar Qualidade vs. Velocidade

No arquivo `modal_whisperx.py`:

```python
# Mais rápido (menor qualidade)
GPU_CONFIG = "t4"  # ~$0.0002/s
self.model = whisperx.load_model("base")

# Balanceado (padrão)
GPU_CONFIG = "a10g"  # ~$0.0006/s
self.model = whisperx.load_model("large-v3")

# Máxima qualidade (mais lento/caro)
GPU_CONFIG = "a100"  # ~$0.003/s
self.model = whisperx.load_model("large-v3")
```

Depois de alterar, faça novo deploy:
```bash
modal deploy modal_whisperx.py
```

### Container Idle Timeout

Para reduzir custos, ajuste quanto tempo o container fica ativo:

```python
@app.cls(
    # ...
    container_idle_timeout=120,  # 2 minutos (padrão)
    # container_idle_timeout=300,  # 5 minutos (mais rápido, mais caro)
    # container_idle_timeout=60,   # 1 minuto (mais econômico)
)
```

---

## 📱 Usando a Interface de Transcrição

### Iniciar Gravação

1. Entre no perfil de um paciente
2. Clique no **botão flutuante roxo** (canto inferior direito)
3. Clique em "Iniciar Transcrição"
4. Permita acesso ao microfone quando solicitado
5. Fale normalmente - o texto aparecerá em tempo real

### Durante a Gravação

- **Pausar**: Clique em "Pausar" para parar temporariamente
- **Retomar**: Clique em "Retomar" para continuar
- **Timer**: Acompanhe a duração no display
- **Texto**: Aparece em tempo real conforme você fala

### Finalizar

1. Clique em "Finalizar Transcrição"
2. O texto completo será salvo no banco de dados
3. Você pode visualizar depois em "Ver Transcrições"

### Visualizar Transcrições Antigas

1. No perfil do paciente, clique em "Ver Transcrições"
2. Veja lista de todas as sessões gravadas
3. Clique em qualquer transcrição para ver detalhes:
   - Texto completo
   - Data e hora
   - Duração
   - Segmentos individuais com timestamps

---

## 🚀 Otimizações de Performance

### Cache de Modelos

O Modal usa um volume persistente para cachear o modelo Whisper:

```python
model_cache = modal.Volume.from_name("whisperx-model-cache", create_if_missing=True)
```

**Benefícios:**
- ✅ Primeiro deploy: ~10 minutos (baixa modelo)
- ✅ Deploys seguintes: ~2 minutos (usa cache)
- ✅ Reduz tempo de cold start
- ✅ Economiza largura de banda

### Cold Start vs. Warm Start

**Cold Start** (primeira requisição):
- Container precisa iniciar
- Modelo precisa carregar na GPU
- Tempo: ~10-20 segundos

**Warm Start** (requisições subsequentes):
- Container já está ativo
- Modelo já está na memória
- Tempo: ~1-2 segundos

**Dica**: Para manter warm, faça requisições regulares ou aumente `container_idle_timeout`.

### Streaming de Áudio

O sistema envia chunks de 5 segundos para:
- ✅ Feedback em tempo real
- ✅ Não sobrecarregar memória
- ✅ Melhor experiência do usuário
- ✅ Recuperação de erros mais fácil

---

## 🔒 Segurança e Privacidade

### Dados do Paciente

⚠️ **IMPORTANTE**: Transcrições podem conter informações sensíveis!

**Recomendações:**

1. **Banco de Dados**:
   - Use RLS (Row Level Security) no Supabase
   - Restrinja acesso apenas a usuários autenticados
   - Considere criptografia at-rest

2. **API do Modal**:
   - O áudio é processado em memória
   - Não é armazenado no Modal
   - É descartado após processamento
   - Use HTTPS sempre

3. **Navegador**:
   - Áudio capturado localmente
   - Enviado diretamente ao servidor
   - Não fica no cache do navegador

### Conformidade LGPD/GDPR

Para estar em conformidade:

- [ ] Obter consentimento do paciente antes de gravar
- [ ] Informar que áudio será processado por IA (Modal)
- [ ] Permitir que paciente acesse suas transcrições
- [ ] Permitir exclusão de transcrições
- [ ] Documentar onde os dados são processados
- [ ] Implementar retenção de dados (auto-delete após X dias)

**Exemplo de implementação**:

```typescript
// Adicionar coluna ao banco
ALTER TABLE transcriptions ADD COLUMN consent_given BOOLEAN DEFAULT FALSE;

// Auto-delete após 90 dias
CREATE OR REPLACE FUNCTION delete_old_transcriptions()
RETURNS void AS $$
BEGIN
  DELETE FROM transcriptions
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
```

---

## 💾 Backup e Recuperação

### Exportar Transcrições

**Via Supabase Dashboard**:
1. Acesse seu projeto no Supabase
2. Vá em "Table Editor"
3. Selecione tabela `transcriptions`
4. Clique em "Export" → CSV/JSON

**Via SQL**:
```sql
-- Exportar todas as transcrições
COPY (
  SELECT t.*, p.name as patient_name
  FROM transcriptions t
  JOIN patients p ON t.patient_id = p.id
  ORDER BY t.created_at DESC
) TO '/tmp/transcriptions.csv' CSV HEADER;
```

### Backup Automático

Configure backup automático no Supabase:
- Projeto → Settings → Database → Backups
- Habilite "Point-in-time Recovery"
- Retenção: 7 dias (plano gratuito) ou 30 dias (plano pago)

---

## 📈 Monitoramento e Analytics

### Dashboard Modal

Acesse: https://modal.com/apps

**Métricas disponíveis:**
- Número de requisições
- Tempo médio de processamento
- Uso de GPU (%)
- Custos acumulados
- Logs de erro
- Cold starts vs. warm starts

### Logs em Tempo Real

```bash
# Ver logs ao vivo
modal app logs whisperx-transcription --follow

# Filtrar por erro
modal app logs whisperx-transcription | grep ERROR

# Últimas 100 linhas
modal app logs whisperx-transcription --tail 100
```

### Métricas Importantes

**Acompanhe:**
1. **Latência**: Tempo médio de transcrição
2. **Taxa de Erro**: % de transcrições que falharam
3. **Custo por Minuto**: $ gasto / minutos transcritos
4. **Uso de GPU**: Se está próximo do limite

**Alertas recomendados:**
- Latência > 15 segundos
- Taxa de erro > 5%
- Custo mensal > $25 (perto do free tier)

---

## 🧪 Testes e Validação

### Testar Localmente (Sem Deploy)

```bash
# Servir localmente (usa sua GPU se disponível)
modal serve modal_whisperx.py

# Em outro terminal, teste
curl -X POST http://localhost:8000/transcribe \
  -F "audio_file=@test-audio.wav" \
  -F "language=pt"
```

### Testar com Áudio de Exemplo

Crie um arquivo `test-transcription.js`:

```javascript
const fs = require('fs')
const fetch = require('node-fetch')

async function testTranscription() {
  const audioBuffer = fs.readFileSync('./test-audio.wav')

  const formData = new FormData()
  formData.append('audio_file', new Blob([audioBuffer]))
  formData.append('language', 'pt')

  const response = await fetch(
    process.env.MODAL_WHISPERX_ENDPOINT,
    {
      method: 'POST',
      body: formData
    }
  )

  const result = await response.json()
  console.log('Transcrição:', result.text)
  console.log('Segmentos:', result.segments.length)
  console.log('Duração:', result.duration, 's')
}

testTranscription()
```

Execute:
```bash
node test-transcription.js
```

### Validar Qualidade

**Critérios de qualidade**:
- ✅ Acurácia > 90% (comparar com texto real)
- ✅ Timestamps precisos (± 0.5s)
- ✅ Pontuação correta
- ✅ Nomes próprios reconhecidos
- ✅ Termos técnicos odontológicos

**Melhorar acurácia**:
1. Fale claramente e pausadamente
2. Use microfone de qualidade
3. Reduza ruído de fundo
4. Considere usar modelo fine-tuned para odontologia

---

## 🌐 Deploy em Produção

### Checklist Pré-Produção

- [ ] Testado com vários pacientes
- [ ] Validado em diferentes navegadores
- [ ] Implementado tratamento de erros
- [ ] Configurado RLS no Supabase
- [ ] Adicionado política de privacidade
- [ ] Documentado processo para equipe
- [ ] Configurado backups automáticos
- [ ] Definido limites de uso
- [ ] Preparado plano de contingência

### Configurações de Produção

**1. Aumentar Timeout do Modal**:
```python
@app.cls(
    timeout=600,  # 10 minutos
    container_idle_timeout=300,  # 5 minutos para produção
)
```

**2. Configurar Rate Limiting**:
```typescript
// src/app/api/transcribe/route.ts
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 requisições por IP
  message: 'Muitas transcrições. Tente novamente em 15 minutos.'
})
```

**3. Adicionar Logging**:
```typescript
console.log('[Transcription] Started', {
  patientId,
  timestamp: new Date().toISOString(),
  audioSize: audioBlob.size
})
```

**4. Monitorar Custos**:
- Configure alerta no Modal para $20/mês
- Revise dashboard semanalmente
- Considere upgrade se necessário

### Escalabilidade

**Limites atuais:**
- Modal free tier: $30/mês
- ~1000 minutos de transcrição/mês
- ~33 minutos por dia útil
- ~3-4 consultas de 10 minutos/dia

**Para escalar:**
1. Upgrade para Modal paid ($0.0006/s)
2. Implementar fila de processamento
3. Considerar batch processing fora de horário de pico
4. Usar GPU menor (T4) para economizar

---

## 🆘 Suporte e Recursos

### Documentação Oficial

- **Modal**: https://modal.com/docs
- **WhisperX**: https://github.com/m-bain/whisperX
- **Whisper**: https://github.com/openai/whisper
- **Supabase**: https://supabase.com/docs

### Comunidade

- **Modal Discord**: https://discord.gg/modal
- **WhisperX Issues**: https://github.com/m-bain/whisperX/issues

### FAQ

**P: Posso usar outro modelo de IA?**
R: Sim! Substitua `large-v3` por `base`, `small`, `medium`, ou `large-v2` em `modal_whisperx.py`.

**P: Funciona offline?**
R: Não. O Modal processa na nuvem. Para offline, você precisaria rodar WhisperX localmente.

**P: Quantas línguas suporta?**
R: WhisperX suporta 90+ idiomas. Os principais: pt, en, es, fr, de, it, ja, ko, zh.

**P: Posso editar transcrições?**
R: Sim, adicione feature de edição no componente `TranscriptionViewer`. Os dados estão no Supabase.

**P: Como exportar para Word/PDF?**
R: Implemente botão de exportação que gera documento com bibliotecas como `docx` ou `jsPDF`.

---

## 🎓 Próximos Passos

### Melhorias Sugeridas

1. **Interface**:
   - [ ] Botão de exportar para PDF/DOCX
   - [ ] Busca em transcrições
   - [ ] Highlights de termos importantes
   - [ ] Player de áudio sincronizado

2. **IA**:
   - [ ] Resumo automático da consulta
   - [ ] Extração de diagnósticos/prescrições
   - [ ] Detecção de termos técnicos
   - [ ] Tradução automática

3. **Produtividade**:
   - [ ] Templates de transcrição
   - [ ] Comandos de voz ("nova linha", "parágrafo")
   - [ ] Atalhos de teclado
   - [ ] Integração com prontuário

4. **Segurança**:
   - [ ] Autenticação de usuários
   - [ ] Auditoria de acessos
   - [ ] Criptografia E2E
   - [ ] Assinatura digital

### Recursos Adicionais

**Tutoriais:**
- [Como usar WhisperX localmente](https://github.com/m-bain/whisperX#usage)
- [Modal para iniciantes](https://modal.com/docs/guide)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)

**Código de exemplo:**
```typescript
// Exemplo: Resumo automático com GPT
async function summarizeTranscription(text: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: `Resuma esta consulta odontológica em tópicos:\n\n${text}`
      }]
    })
  })

  const data = await response.json()
  return data.choices[0].message.content
}
```

---

## 🎉 Conclusão

Você agora tem um sistema completo de transcrição de consultas em tempo real!

**Benefícios:**
- ✅ Economiza tempo (sem digitação manual)
- ✅ Registro preciso das consultas
- ✅ Busca posterior facilitada
- ✅ Conformidade com regulamentações
- ✅ Melhora documentação clínica

**Custos:**
- Praticamente GRÁTIS para uso normal
- $30/mês cobrem ~1000 minutos
- Escala conforme necessidade

**Qualidade:**
- Modelo Whisper large-v3 (estado da arte)
- Otimizado para português
- Word-level accuracy
- 90%+ de precisão

---

**Dúvidas?** Consulte a [documentação oficial do Modal](https://modal.com/docs) ou abra uma issue no GitHub do projeto!

**Bom trabalho!** 🚀🎤
