import { GoogleGenAI } from "@google/genai"

// Função para transformar sorriso usando APENAS Google Gemini 2.5 Flash Image
export async function transformSmileWithGemini(imageData: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada. Adicione no .env.local: NEXT_PUBLIC_GEMINI_API_KEY=sua_chave')
  }

  // Inicializar Google GenAI
  const ai = new GoogleGenAI({ apiKey })

  // Converter base64 para formato correto (remover prefixo data:image/...)
  const base64Image = imageData.includes('base64,')
    ? imageData.split('base64,')[1]
    : imageData

  // Detectar mime type
  const mimeType = imageData.includes('image/png') ? 'image/png' : 'image/jpeg'

  // Criar prompt seguindo o exemplo exato da documentação
  const prompt = [
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Image,
      },
    },
    {
      text: `- Alter only the smile of the person in the image.
- Keep everything else about the face, background, lighting, and expressions exactly the same as the original.
- Align all the teeth, **making sure there are no gaps between them**, and make the teeth white, **but not unnaturally bright.**
- Make any necessary changes in the mouth area (such as adjusting gums, lips, or shape) to achieve a harmonious - and aesthetically pleasing smile.
- Do not deform the face or change the overall style of the mouth too much; preserve the person's general appearance as in the original image.`
    },
  ]

  // Fazer requisição ao Gemini 2.5 Flash Image
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: prompt,
  })

  // Processar resposta
  if (!response.candidates || !response.candidates[0]) {
    throw new Error('Nenhuma resposta válida do Gemini')
  }

  // Extrair imagem gerada
  const parts = response.candidates[0].content?.parts
  if (!parts) {
    throw new Error('Nenhuma parte de conteúdo retornada pelo Gemini')
  }

  for (const part of parts) {
    if (part.inlineData && part.inlineData.data) {
      // Retornar imagem em formato base64
      const generatedMimeType = part.inlineData.mimeType || 'image/png'
      return `data:${generatedMimeType};base64,${part.inlineData.data}`
    }

    if (part.text) {
      console.log('Gemini response text:', part.text)
    }
  }

  throw new Error('Gemini não retornou uma imagem. Verifique se o modelo está disponível.')
}
