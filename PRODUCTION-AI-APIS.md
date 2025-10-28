# 🚀 APIs de IA para Produção - Aprimoramento de Sorriso

## ⚠️ Implementação Atual

A implementação atual usa **filtros de imagem locais** (Canvas API) para demonstração. Isso funciona para:
- ✅ Demonstrar a UI/UX
- ✅ Testar o fluxo completo
- ✅ Não depender de APIs externas
- ✅ Sem custos

**Limitações:**
- ❌ Não usa IA real
- ❌ Resultados limitados (apenas filtros de brilho/contraste)
- ❌ Não detecta dentes especificamente

## 🎯 APIs Recomendadas para Produção

### 1. **Replicate.com** ⭐ RECOMENDADO

**Melhor para:** Edição facial com IA

**Modelos Disponíveis:**
- `cjwbw/rembg` - Remoção de fundo
- `tencentarc/gfpgan` - Restauração facial
- Modelos customizados de edição facial

**Prós:**
- ✅ Fácil de integrar
- ✅ Pay-as-you-go
- ✅ Vários modelos especializados
- ✅ Boa documentação

**Contras:**
- ❌ Requer conta
- ❌ ~$0.01-0.05 por imagem

**Exemplo de Integração:**

```typescript
async function enhanceSmileReplicate(imageData: string): Promise<string> {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: "MODEL_VERSION_HERE",
      input: {
        image: imageData,
        scale: 2,
        face_enhance: true
      }
    })
  })

  const prediction = await response.json()
  // Poll for completion
  return prediction.output
}
```

---

### 2. **Stability AI (Stable Diffusion)**

**Melhor para:** Edição criativa com controle

**API:** `https://api.stability.ai`

**Prós:**
- ✅ Resultados de alta qualidade
- ✅ Controle fino sobre edições
- ✅ Suporta image-to-image

**Contras:**
- ❌ Mais caro (~$0.10 por imagem)
- ❌ Configuração mais complexa

**Exemplo:**

```typescript
async function enhanceSmileStability(imageData: string): Promise<string> {
  const formData = new FormData()
  formData.append('init_image', base64ToBlob(imageData))
  formData.append('text_prompts[0][text]', 'professional dental photo, white teeth, natural smile')
  formData.append('text_prompts[0][weight]', '1')
  formData.append('cfg_scale', '7')
  formData.append('image_strength', '0.35')

  const response = await fetch(
    'https://api.stability.ai/v1/generation/stable-diffusion-v1-6/image-to-image',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
      },
      body: formData
    }
  )

  const result = await response.json()
  return `data:image/png;base64,${result.artifacts[0].base64}`
}
```

---

### 3. **RunwayML**

**Melhor para:** Edições profissionais

**Modelos:** Gen-2, Image Variation

**Prós:**
- ✅ Interface simples
- ✅ Bons resultados
- ✅ Editor visual integrado

**Contras:**
- ❌ Precisa de créditos
- ❌ Mais voltado para vídeo

---

### 4. **OpenAI DALL-E (Image Edit)**

**Melhor para:** Edições gerais com máscara

**API:** `https://api.openai.com/v1/images/edits`

**Prós:**
- ✅ Fácil de usar
- ✅ Boa qualidade
- ✅ Já tem conta OpenAI?

**Contras:**
- ❌ Requer máscara manual
- ❌ ~$0.02 por imagem
- ❌ Nem sempre preciso para odontologia

**Exemplo:**

```typescript
async function enhanceSmileDallE(imageData: string): Promise<string> {
  const formData = new FormData()
  formData.append('image', base64ToBlob(imageData))
  formData.append('prompt', 'brighten teeth, enhance smile, professional dental photo')
  formData.append('n', '1')
  formData.append('size', '1024x1024')

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData
  })

  const result = await response.json()
  return result.data[0].url
}
```

---

### 5. **Cloudinary AI** 💰 MAIS BARATO

**Melhor para:** Transformações automáticas

**Prós:**
- ✅ CDN integrado
- ✅ Muito barato
- ✅ Fácil implementação
- ✅ Transformações em tempo real

**Contras:**
- ❌ Menos controle criativo
- ❌ Resultados básicos

**Exemplo:**

```typescript
async function enhanceSmileCloudinary(imageData: string): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET

  const formData = new FormData()
  formData.append('file', imageData)
  formData.append('upload_preset', uploadPreset)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData
    }
  )

  const result = await response.json()

  // Aplicar transformações automáticas
  const transformedUrl = result.secure_url.replace(
    '/upload/',
    '/upload/e_improve,e_sharpen,e_brightness:20,e_contrast:10/'
  )

  return transformedUrl
}
```

---

## 🔧 Como Implementar

### 1. Escolha a API

Para odontologia, recomendo:
1. **Replicate** (melhor custo-benefício)
2. **Cloudinary** (mais barato, resultados ok)
3. **Stability AI** (melhor qualidade, mais caro)

### 2. Atualize o arquivo `gemini-smile.ts`

```typescript
// Substitua a função atual por:
export async function transformSmileWithGemini(imageData: string): Promise<string> {
  // Escolha uma das implementações acima
  return await enhanceSmileReplicate(imageData)
  // ou
  return await enhanceSmileCloudinary(imageData)
}
```

### 3. Adicione as credenciais no `.env.local`

```env
# Replicate
REPLICATE_API_TOKEN=r8_xxx

# Ou Stability AI
STABILITY_API_KEY=sk-xxx

# Ou OpenAI
OPENAI_API_KEY=sk-xxx

# Ou Cloudinary
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```

### 4. Teste!

```bash
npm run dev
```

---

## 💰 Comparação de Custos

| API | Custo por Imagem | Qualidade | Velocidade | Dificuldade |
|-----|------------------|-----------|------------|-------------|
| **Replicate** | $0.01-0.05 | ⭐⭐⭐⭐ | Média | Fácil |
| **Stability AI** | $0.10 | ⭐⭐⭐⭐⭐ | Lenta | Média |
| **DALL-E** | $0.02 | ⭐⭐⭐ | Rápida | Fácil |
| **Cloudinary** | $0.001 | ⭐⭐ | Muito Rápida | Muito Fácil |
| **RunwayML** | Créditos | ⭐⭐⭐⭐ | Média | Média |

---

## 🎯 Recomendação Final

### Para MVP/Teste:
→ Use a **implementação atual** (filtros locais)

### Para Produção com Budget:
→ Use **Cloudinary** ($0.001/img)

### Para Melhor Qualidade:
→ Use **Replicate** com modelo facial ($0.03/img)

### Para Profissional/Premium:
→ Use **Stability AI** ($0.10/img)

---

## 📚 Recursos

- [Replicate Documentation](https://replicate.com/docs)
- [Stability AI API](https://platform.stability.ai/docs/api-reference)
- [OpenAI Image API](https://platform.openai.com/docs/guides/images)
- [Cloudinary Transformations](https://cloudinary.com/documentation/image_transformations)

---

**Nota:** A implementação atual com filtros Canvas funciona perfeitamente para demonstração e pode ser suficiente dependendo das expectativas dos usuários!
