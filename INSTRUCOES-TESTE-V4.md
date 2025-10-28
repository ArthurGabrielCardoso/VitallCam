# 🧪 INSTRUÇÕES DE TESTE - V4 TURBO + DENTAL + GEMINI

## ✅ CONFIGURAÇÃO CONCLUÍDA

- ✅ Modal deployed: whisperx-vitallcam-v4-turbo-dental
- ✅ Endpoint configurado no .env.local
- ✅ Gemini integration ativa

---

## 🚀 PRÓXIMO PASSO: REINICIAR NEXT.JS

### 1. Parar o servidor (se estiver rodando):
```
Pressione Ctrl+C no terminal do Next.js
```

### 2. Iniciar novamente:
```bash
npm run dev
```

---

## 🧪 COMO TESTAR

### 1. Abrir no navegador:
```
http://localhost:3000
```

### 2. Abrir Console (F12):
- Pressione **F12**
- Clique na aba **"Console"**
- Deixe aberto para ver os logs

### 3. Entrar em perfil de paciente:
- Clique em qualquer paciente
- Vá para a página de perfil

### 4. Iniciar transcrição:
- Clique no **botão roxo flutuante** (canto inferior direito)
- Permita acesso ao microfone

### 5. Falar termos odontológicos (script de teste):

**SCRIPT RECOMENDADO (2-3 minutos):**

```
VOCÊ (como dentista):
"Bom dia, vamos iniciar a consulta. Qual o motivo da sua visita?"

VOCÊ (como paciente):
"Estou com dor no dente do fundo, o molar vinte e seis."

VOCÊ (como dentista):
"Vou fazer o exame com a câmera intraoral de aumento sessenta vezes."
"Aqui vejo uma cárie profunda que atingiu a polpa do dente."
"Vamos precisar realizar um tratamento de canal, chamado endodontia."
"Depois faremos uma restauração em resina composta."

VOCÊ (como auxiliar):
"Doutor, já preparei o material para a anamnese."

VOCÊ (como dentista):
"Perfeito. Paciente, você tem alguma alergia à anestesia?"

VOCÊ (como paciente):
"Não, doutor. Nunca tive problemas."

VOCÊ (como dentista):
"Ótimo. Vou prescrever uma radiografia panorâmica para avaliar melhor."
"O plano de tratamento inclui: canal, restauração e profilaxia."
```

### 6. Clicar em "Parar":
- Após 2-3 minutos, clique em **"Parar Transcrição"**
- Aguarde o processamento

---

## 👀 O QUE OBSERVAR

### No Console (F12):

```
✅ [Transcrição] Solicitando acesso ao microfone...
✅ [Transcrição] Microfone autorizado
✅ [Transcrição] Chunk capturado: XXXX bytes
...
✅ [Transcrição] Parando gravação...
✅ [Transcrição] Áudio completo: XXXXX bytes
✅ [Transcrição] Enviando ÁUDIO COMPLETO para API Modal...
✅ [Transcrição] Resposta recebida: 200
✅ [Transcrição] Resultado WhisperX: {...}
✅ [Transcrição] Iniciando pós-processamento com Gemini...
✅ [Transcrição] Pós-processamento Gemini concluído
✅ [Transcrição] Melhorias aplicadas: [...]
✅ [Transcrição] ✅ Transcrição completa + pós-processamento salvo!
```

### Toasts na Tela:

1. **"Gravação iniciada"** - Quando clicar em iniciar
2. **"Processando transcrição..."** - Quando parar
3. **"Aprimorando transcrição... Gemini AI está corrigindo"** - Durante Gemini
4. **"Transcrição concluída! XXX palavras | Y melhorias aplicadas"** - Sucesso!

---

## ✅ RESULTADO ESPERADO

### Texto deve aparecer formatado assim:

```
Bom dia, vamos iniciar a consulta. Qual o motivo da sua visita?

Estou com dor no dente do fundo, o molar 26 (primeiro molar superior direito).

Vou fazer o exame com a câmera intraoral de aumento 60x. Aqui vejo uma cárie
profunda que atingiu a polpa do dente. Vamos precisar realizar um tratamento
de canal, chamado endodontia. Depois faremos uma restauração em resina composta.

Doutor, já preparei o material para a anamnese.

Perfeito. Paciente, você tem alguma alergia à anestesia?

Não, doutor. Nunca tive problemas.

Ótimo. Vou prescrever uma radiografia panorâmica para avaliar melhor. O plano
de tratamento inclui: tratamento de canal (endodontia), restauração em resina
composta e profilaxia (limpeza dental).
```

**Observe:**
- ✅ Termos técnicos corretos (molar 26, endodontia, etc.)
- ✅ Pontuação adequada
- ✅ Formatação em parágrafos
- ✅ Números escritos por extenso quando apropriado
- ✅ Explicações entre parênteses (ex: endodontia)

---

## 🔍 COMPARAÇÃO COM V3

### V3 (sem initial prompt + sem Gemini):
```
"bom dia vamos iniciar consulta qual motivo visita dor dente fundo molar 26
exame câmera intraoral aumento 60 vezes cárie profunda atingiu polpa dente
precisar realizar tratamento canal endodontia restauração resina composta"
```

### V4 (com initial prompt + Gemini):
```
Bom dia, vamos iniciar a consulta. Qual o motivo da sua visita?

Estou com dor no dente do fundo, o molar 26 (primeiro molar superior direito).

Vou fazer o exame com a câmera intraoral de aumento 60x...
```

**Diferença é ENORME!** 🚀

---

## ❌ PROBLEMAS COMUNS

### 1. Erro: "Gemini API key not configured"
**Solução:**
- Verificar se NEXT_PUBLIC_GEMINI_API_KEY está no .env.local
- Restart Next.js

### 2. Texto sem formatação (igual ao V3)
**Possíveis causas:**
- Gemini falhou (veja console)
- Quota excedida (free tier: 1500 req/dia)
- Erro de rede

**O que fazer:**
- Veja os logs no console (F12)
- Sistema usa fallback (transcrição bruta do WhisperX)

### 3. Transcrição não começa
**Verificar:**
- Permissão do microfone foi concedida?
- Console mostra erro?
- Endpoint do Modal está correto no .env.local?

---

## 📊 MÉTRICAS PARA AVALIAR

### Qualidade da transcrição:
- [ ] Capturou todos os termos técnicos?
- [ ] Números de dentes corretos (26, 11, etc.)?
- [ ] Palavras difíceis reconhecidas (endodontia, profilaxia)?

### Formatação:
- [ ] Texto tem pontuação?
- [ ] Parágrafos separados corretamente?
- [ ] Capitalização adequada?

### Pós-processamento Gemini:
- [ ] Console mostra "Pós-processamento Gemini concluído"?
- [ ] Lista de melhorias aplicadas aparece?
- [ ] Texto final diferente do bruto?

### Performance:
- [ ] Processamento completo em ~8-10 minutos?
- [ ] Sem travamentos?
- [ ] Toasts informativos apareceram?

---

## 💡 DICAS

1. **Fale devagar e claro** - Melhora reconhecimento
2. **Use termos técnicos reais** - Testa o initial prompt
3. **Simule múltiplos falantes** - Testa diarização
4. **Teste com 2-5 minutos primeiro** - Mais rápido para validar

---

## 📝 APÓS O TESTE

Me mande:

1. **Screenshot do resultado final** (texto formatado)
2. **Logs do console** (copy/paste)
3. **Sua avaliação:**
   - Qualidade melhorou vs V3? (1-10)
   - Termos técnicos corretos? (sim/não)
   - Formatação profissional? (sim/não)
   - Vale a pena? (sim/não)

---

**BOA SORTE NO TESTE! 🚀🦷**

Se der qualquer problema, me avisa que eu te ajudo!
