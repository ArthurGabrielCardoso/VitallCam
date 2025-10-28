# 📊 Gemini 2.5 Flash Image - Informações de Quota

## ⚠️ IMPORTANTE: Limites do Free Tier

O modelo `gemini-2.5-flash-image` tem **limites MUITO BAIXOS** no plano gratuito:

### Limites Atuais (Free Tier):
- **Requisições por dia**: Limitado (varia)
- **Requisições por minuto**: Muito baixo
- **Tokens de entrada por minuto**: Limitado

### Erro 429 - "Quota Exceeded"

Se você ver este erro:
```
Error 429: You exceeded your current quota
Quota exceeded for metric: generate_content_free_tier_requests
```

**Significa que:**
- ✅ A API está configurada corretamente
- ✅ Sua chave está funcionando
- ❌ Você atingiu o limite de uso gratuito

## 🔧 Soluções:

### 1. Aguardar Reset da Quota
O erro mostra: `Please retry in 38.420861211s`
- Aguarde o tempo especificado
- A quota reseta automaticamente

### 2. Usar Modelo Diferente (NÃO gera imagens)
Outros modelos do Gemini:
- `gemini-1.5-flash` - Apenas texto/análise
- `gemini-1.5-pro` - Apenas texto/análise
- `gemini-2.0-flash` - Apenas texto/análise

⚠️ **ATENÇÃO:** Apenas o `gemini-2.5-flash-image` gera imagens!

### 3. Upgrade para Plano Pago
Para uso em produção, considere:
- Google AI Studio Paid Tier
- Google Cloud Vertex AI
- Limites muito maiores
- Custo por requisição

## 💡 Recomendações

### Para Desenvolvimento/Teste:
- ✅ Use com parcimônia
- ✅ Teste com poucas imagens
- ✅ Aguarde reset de quota entre testes
- ✅ Considere implementar cache

### Para Produção:
1. **Opção A**: Upgrade para plano pago do Gemini
2. **Opção B**: Use API alternativa (Replicate, Stability AI, etc)
3. **Opção C**: Implemente fila de processamento com retry

## 📈 Monitoramento de Uso

Monitore seu uso em:
- https://ai.google.dev/gemini-api/docs/pricing
- https://makersuite.google.com/app/usage

## 🎯 Estratégias para Economizar Quota

### 1. Implementar Cache
```typescript
const cache = new Map<string, string>()

export async function transformSmileWithCache(imageData: string): Promise<string> {
  // Gerar hash da imagem
  const imageHash = await hashImage(imageData)

  // Verificar cache
  if (cache.has(imageHash)) {
    return cache.get(imageHash)!
  }

  // Processar com Gemini
  const result = await transformSmileWithGemini(imageData)

  // Salvar no cache
  cache.set(imageHash, result)

  return result
}
```

### 2. Limitar Usos por Usuário
```typescript
const userUsage = new Map<string, number>()
const MAX_PER_USER = 5

export async function transformWithLimit(userId: string, imageData: string): Promise<string> {
  const usage = userUsage.get(userId) || 0

  if (usage >= MAX_PER_USER) {
    throw new Error('Limite diário atingido. Tente novamente amanhã.')
  }

  const result = await transformSmileWithGemini(imageData)
  userUsage.set(userId, usage + 1)

  return result
}
```

### 3. Fila de Processamento
```typescript
// Processar em lote durante horários específicos
const queue: Array<{imageData: string, callback: Function}> = []

export async function queueTransform(imageData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    queue.push({ imageData, callback: resolve })
  })
}

// Processar fila a cada 5 minutos
setInterval(processQueue, 5 * 60 * 1000)
```

## 📞 Suporte

Se você precisa de limites maiores:
1. Acesse: https://support.google.com/
2. Solicite aumento de quota
3. Ou faça upgrade para plano pago

## 🔗 Links Úteis

- [Documentação Gemini API](https://ai.google.dev/gemini-api/docs)
- [Pricing e Limites](https://ai.google.dev/pricing)
- [Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [AI Studio](https://aistudio.google.com/)

---

**Resumo:** O modelo funciona perfeitamente, mas tem limites baixos no free tier. Para produção, considere plano pago ou APIs alternativas.
