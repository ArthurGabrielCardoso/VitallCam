package com.vitallcam.ui.theme

import androidx.compose.ui.graphics.Color

// Cores espelhadas do design web (Tailwind classes usadas no React).
// Mantém paridade exata com a versão webview pra usuário não notar diferença.

// Neutrais (fundo da tela e bordas)
val Neutral950 = Color(0xFF0a0a0a)
val Neutral900 = Color(0xFF171717)
val Neutral800 = Color(0xFF262626)
val Neutral700 = Color(0xFF404040)
val Neutral500 = Color(0xFF737373)
val Neutral400 = Color(0xFFa3a3a3)
val Neutral300 = Color(0xFFd4d4d4)
val Neutral100 = Color(0xFFf5f5f5)

// Teal (cor primária — botões, indicadores ativos)
val Teal400 = Color(0xFF2dd4bf)
val Teal500 = Color(0xFF14b8a6)
val Teal600 = Color(0xFF0d9488)
val Teal700 = Color(0xFF0f766e)
val Teal700Alpha85 = Color(0xD90f766e) // bg-teal-700/85
val Teal300Alpha30 = Color(0x4D5eead4) // ring-teal-300/30

// Dourado (botão de captura ativo)
val Dourado400 = Color(0xFFc99d6b)
val Dourado500 = Color(0xFFa87f5c)
val Dourado600 = Color(0xFF8a6448)

// Cinza (textos secundários, fundos de cards)
val Gray50 = Color(0xFFf9fafb)
val Gray100 = Color(0xFFf3f4f6)
val Gray200 = Color(0xFFe5e7eb)
val Gray500 = Color(0xFF6b7280)
val Gray600 = Color(0xFF4b5563)
val Gray700 = Color(0xFF374151)
val Gray800 = Color(0xFF1f2937)

// Estados
val Red500 = Color(0xFFef4444)
val Amber50 = Color(0xFFfffbeb)
val Amber200 = Color(0xFFfde68a)
val Amber900 = Color(0xFF78350f)

// Branco com transparências usadas no design
val White85 = Color(0xD9FFFFFF)  // text-white/85
val White70 = Color(0xB3FFFFFF)  // text-white/70
val White40 = Color(0x66FFFFFF)  // ring-white/40
val White10 = Color(0x1AFFFFFF)  // hover:bg-white/10
val White05 = Color(0x0DFFFFFF)  // ring-white/5

// Preto com transparência
val Black55 = Color(0x8C000000)  // bg-black/55 (recording indicator)
val Black70 = Color(0xB3000000)  // bg-black/70 (loading overlay)
val Black85 = Color(0xD9000000)  // bg-black/85 (modal backdrop)
