# Sistema de Transcrição com WhisperX e Modal

Este guia explica como configurar e usar o sistema de transcrição em tempo real do VitallCam.

## Visão Geral

O sistema de transcrição permite que você grave e transcreva automaticamente conversas durante consultas odontológicas. Utiliza:

- **WhisperX**: Modelo de IA avançado para transcrição de áudio com timestamps precisos
- **Modal**: Plataforma serverless para hospedar e escalar o modelo WhisperX
- **Next.js API Routes**: Interface entre o frontend e o Modal
- **Supabase**: Armazenamento das transcrições

## Arquitetura

```
[Navegador] → [Captura Áudio] → [Next.js API] → [Modal WhisperX] → [Supabase]
     ↓                                                                    ↓
[Exibição em Tempo Real] ←─────────────────────────────────────────────┘
```

## Pré-requisitos

1. **Conta Modal**: https://modal.com
2. **Python 3.11+** instalado
3. **Modal CLI** instalado

## Instalação

### 1. Instalar Modal CLI

```bash
pip install modal
```

### 2. Autenticar com Modal

```bash
modal token new
```

Isso abrirá seu navegador para autenticação.

### 3. Deploy do Servidor WhisperX

Na raiz do projeto, execute:

```bash
modal deploy modal_whisperx.py
```

Após o deploy, você receberá uma URL como:
```
https://your-username--whisperx-transcription-transcribe-endpoint.modal.run
```

Copie esta URL!

### 4. Configurar Variáveis de Ambiente

Edite seu arquivo `.env.local` e adicione:

```env
MODAL_WHISPERX_ENDPOINT=https://your-username--whisperx-transcription-transcribe-endpoint.modal.run
```

### 5. Aplicar Schema do Banco de Dados

No Supabase SQL Editor, execute o arquivo `transcription-schema.sql`:

```sql
-- Cole o conteúdo do arquivo transcription-schema.sql aqui
```

Isso criará as tabelas:
- `transcriptions`: Armazena transcrições completas
- `transcription_segments`: Armazena segmentos individuais com timestamps

## Como Usar

### No Perfil do Paciente

1. **Botão Flutuante**: No canto inferior direito da tela do paciente, você verá um botão de transcrição

2. **Iniciar Gravação**:
   - Clique em "Iniciar Transcrição"
   - Permita o acesso ao microfone
   - A gravação começará imediatamente

3. **Durante a Gravação**:
   - O texto aparecerá em tempo real conforme você fala
   - Você pode pausar/retomar a gravação
   - Você pode navegar pela câmera, tirar fotos, usar IA - tudo continua gravando!
   - Um contador mostra a duração da gravação

4. **Parar Gravação**:
   - Clique em "Parar Transcrição"
   - A transcrição completa será salva automaticamente

### Visualizar Transcrições

1. Clique no botão "Ver Transcrições" no toolbar
2. Todas as transcrições do paciente aparecerão
3. Para cada transcrição você pode:
   - Ver texto completo
   - Ver segmentos com timestamps
   - Copiar texto
   - Exportar como TXT
   - Deletar

## Características Técnicas

### Transcrição em Tempo Real

- Áudio é processado em chunks de 5 segundos
- Cada chunk é enviado ao Modal para transcrição
- Resultados aparecem quase instantaneamente
- Precisão otimizada para português brasileiro

### Timestamps Precisos

- WhisperX fornece timestamps word-level
- Segmentos são salvos com timestamps exatos
- Permite navegação temporal na transcrição

### Diarização (Opcional)

O código suporta diarização de speakers (identificar quem está falando), mas requer:

1. Token do HuggingFace
2. Aceitar termos de uso dos modelos de diarização
3. Configuração adicional no código

Para habilitar, veja comentários em `modal_whisperx.py`.

## Custos

### Modal

Modal oferece tier gratuito generoso:
- $30 créditos mensais grátis
- Depois: ~$0.0001 por segundo de GPU
- WhisperX large-v3 roda em GPU A10G

**Estimativa**: ~1000 minutos de transcrição/mês no tier gratuito

### Supabase

Transcrições são armazenadas como texto:
- Muito leve no banco de dados
- Não afeta limite do tier gratuito significativamente

## Troubleshooting

### "Modal endpoint not configured"

Certifique-se de que `MODAL_WHISPERX_ENDPOINT` está configurado em `.env.local`

### "Falha ao acessar microfone"

- Verifique permissões do navegador
- Use HTTPS (localhost funciona em HTTP)
- Alguns navegadores bloqueiam microfone em abas inativas

### Transcrição lenta ou erro 429

- O modelo está sendo carregado pela primeira vez (pode levar ~30s)
- Muitas requisições simultâneas
- Limite de quota do Modal atingido

### Texto em português incorreto

O modelo está configurado para português (`language: "pt"`). Se necessário, ajuste em:
- `src/hooks/useTranscription.ts` (linha com `language: 'pt'`)
- `src/app/api/transcribe/route.ts`

## Melhorias Futuras

Possíveis adições:

1. **Diarização completa**: Identificar dentista vs paciente
2. **Resumo automático**: IA para resumir transcrição
3. **Busca**: Buscar por palavras-chave nas transcrições
4. **Export avançado**: PDF, DOCX com formatação
5. **Edição inline**: Corrigir erros de transcrição
6. **Comandos de voz**: "Iniciar transcrição" por voz

## Recursos Adicionais

- [Documentação WhisperX](https://github.com/m-bain/whisperX)
- [Documentação Modal](https://modal.com/docs)
- [Whisper da OpenAI](https://openai.com/research/whisper)

## Suporte

Para dúvidas ou problemas:
1. Verifique os logs no Modal Dashboard
2. Verifique console do navegador (F12)
3. Verifique logs do servidor Next.js
