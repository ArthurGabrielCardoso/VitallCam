import { GoogleGenAI } from "@google/genai"

/**
 * Pós-processamento de transcrição odontológica usando Gemini 2.0 Flash
 *
 * Funções:
 * - Corrigir erros de transcrição
 * - Padronizar termos técnicos odontológicos
 * - Adicionar pontuação adequada
 * - Formatar texto de forma profissional
 * - Identificar e corrigir contexto perdido
 */

export interface TranscriptionSegment {
  text: string
  start: number
  end: number
  speaker?: string
}

export interface PostProcessedTranscription {
  original_text: string
  corrected_text: string
  formatted_text: string
  improvements: string[]
  segments?: TranscriptionSegment[]
}

export async function postProcessDentalTranscription(
  rawTranscription: string,
  segments?: TranscriptionSegment[]
): Promise<PostProcessedTranscription> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada')
  }

  // Inicializar Google GenAI
  const ai = new GoogleGenAI({ apiKey })

  // Criar contexto com segmentos de speaker se disponível
  let contextInfo = ""
  if (segments && segments.length > 0) {
    const speakerCount = new Set(segments.filter(s => s.speaker).map(s => s.speaker)).size
    contextInfo = `\nA transcrição possui ${speakerCount} falantes identificados.`
  }

  // Prompt otimizado para correção de transcrição odontológica
  const prompt = `Você é um especialista em transcrições médicas odontológicas. Analise a transcrição abaixo de uma consulta odontológica e:

1. **CORRIJA erros de transcrição** (palavras mal reconhecidas, termos técnicos incorretos)
2. **IDENTIFIQUE e PADRONIZE termos técnicos** odontológicos para a nomenclatura correta
3. **ADICIONE pontuação** adequada (pontos, vírgulas, pontos de interrogação)
4. **FORMATE o texto** de forma profissional e legível
5. **ORGANIZE em parágrafos** quando apropriado (separe anamnese, exame, plano)
6. **MANTENHA o conteúdo original** - não invente informações, apenas corrija
7. **PRESERVE e FORMATE números de dentes** (ex: "vinte e seis" → "26", "molar vinte e seis" → "molar 26")

CONTEXTO DA CONSULTA ODONTOLÓGICA:
- Consulta inicial com avaliação usando câmera intraoral de aumento 60x
- Participantes: dentista (principal), auxiliar de odontologia, paciente
- Etapas: anamnese do paciente → exame clínico detalhado → apresentação do plano de tratamento
- Duração típica: ~70 minutos${contextInfo}

TERMOS TÉCNICOS ODONTOLÓGICOS (reconheça e padronize):

**Dentes e Anatomia:**
- Tipos: molar, pré-molar, incisivo, canino
- Numeração: 11-18, 21-28, 31-38, 41-48 (FDI)
- Partes: coroa, raiz, polpa, esmalte, dentina, gengiva, periodonto

**Condições e Diagnósticos:**
- cárie, cárie profunda, lesão cariosa
- gengivite, periodontite, doença periodontal
- tártaro, cálculo dental, placa bacteriana
- sensibilidade dental, dor, inflamação, sangramento gengival
- abscesso, fístula, úlcera, afta, lesão

**Procedimentos:**
- restauração, obturação (resina composta, amálgama, ionômero)
- tratamento de canal, endodontia, pulpectomia
- extração, exodontia, extração de siso
- limpeza, profilaxia, raspagem, polimento
- implante dentário, enxerto ósseo
- prótese, coroa, ponte, pivô, faceta, lente de contato dental
- aparelho ortodôntico, bracket, manutenção ortodôntica
- clareamento dental, aplicação de flúor

**Exames:**
- radiografia panorâmica, periapical, bite-wing
- tomografia computadorizada
- câmera intraoral

**Anestesia e Materiais:**
- anestesia local, xilocaína, articaína, mepivacaína
- dique de borracha, isolamento absoluto

TRANSCRIÇÃO BRUTA:
${rawTranscription}

INSTRUÇÕES DE FORMATAÇÃO:
- Use parágrafos para separar diferentes tópicos (anamnese, exame, plano)
- Capitalize nomes próprios e início de frases
- Use numeração para listas de procedimentos se aplicável
- Mantenha termos técnicos em português brasileiro

IMPORTANTE - FORMATO DE RESPOSTA:
Retorne APENAS um objeto JSON válido, sem texto adicional antes ou depois.
NÃO inclua markdown, explicações, ou qualquer texto fora do JSON.

Formato esperado:
{
  "corrected_text": "texto corrigido com erros resolvidos",
  "formatted_text": "texto formatado profissionalmente com parágrafos",
  "improvements": ["lista de melhorias aplicadas"]
}
`

  try {
    // Chamar Gemini 2.0 Flash (rápido e barato)
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",  // Modelo mais recente e rápido
      contents: [{ text: prompt }],
    })

    if (!response.candidates || !response.candidates[0]) {
      throw new Error('Nenhuma resposta válida do Gemini')
    }

    const parts = response.candidates[0].content?.parts
    if (!parts || !parts[0]?.text) {
      throw new Error('Resposta do Gemini sem conteúdo de texto')
    }

    // Extrair resposta JSON
    let responseText = parts[0].text.trim()

    console.log('[Gemini] Resposta bruta (primeiros 200 chars):', responseText.substring(0, 200))

    // Remover markdown code blocks se existirem
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```\n?/g, '')
    }

    // Tentar encontrar JSON válido na resposta (caso tenha texto antes/depois)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      responseText = jsonMatch[0]
    }

    console.log('[Gemini] JSON extraído:', responseText.substring(0, 200))

    const parsed = JSON.parse(responseText)

    return {
      original_text: rawTranscription,
      corrected_text: parsed.corrected_text || rawTranscription,
      formatted_text: parsed.formatted_text || parsed.corrected_text || rawTranscription,
      improvements: parsed.improvements || [],
      segments: segments,
    }

  } catch (error) {
    console.error('[Gemini] Erro no pós-processamento:', error)

    // Fallback: retornar transcrição original se Gemini falhar
    return {
      original_text: rawTranscription,
      corrected_text: rawTranscription,
      formatted_text: rawTranscription,
      improvements: ['Erro no pós-processamento - usando transcrição original'],
      segments: segments,
    }
  }
}

/**
 * Versão simplificada: apenas correção rápida sem formatação completa
 */
export async function quickCorrectTranscription(
  rawTranscription: string
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

  if (!apiKey) {
    return rawTranscription // Fallback
  }

  const ai = new GoogleGenAI({ apiKey })

  const prompt = `Corrija apenas erros óbvios de transcrição neste texto odontológico. Mantenha o texto original o máximo possível, apenas corrigindo palavras claramente erradas e adicionando pontuação básica:

${rawTranscription}

Retorne apenas o texto corrigido, sem explicações.`

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{ text: prompt }],
    })

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text
    return text?.trim() || rawTranscription

  } catch (error) {
    console.error('[Gemini] Erro na correção rápida:', error)
    return rawTranscription
  }
}
