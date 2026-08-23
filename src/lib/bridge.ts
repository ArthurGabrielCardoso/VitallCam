/**
 * Acesso ao backend VitallWhatsApp (Clinicorp, radiografias).
 *
 * Só roda no servidor: a chave nunca pode chegar ao navegador. Por isso as
 * rotas em /api/* fazem de intermediárias em vez de o front chamar direto.
 *
 * Variáveis (Vercel / .env.local):
 *   CLINICORP_BRIDGE_URL  base do VitallWhatsApp
 *   CLINICORP_BRIDGE_KEY  mesmo valor do API_SECRET de lá
 */

import { NextResponse } from 'next/server'

/**
 * 90s porque a primeira chamada depois de um tempo parado paga o 2FA do
 * Clinicorp (Playwright + código por e-mail, ~60s). Depois o JWT fica quente e
 * responde em ~1s. Não vale pra radiografias, que só leem o banco, mas um teto
 * generoso não atrapalha.
 */
const TIMEOUT_MS = 90_000

export async function chamarPonte(path: string): Promise<NextResponse> {
  const base = process.env.CLINICORP_BRIDGE_URL
  const key = process.env.CLINICORP_BRIDGE_KEY

  if (!base || !key) {
    return NextResponse.json(
      { error: 'ponte não configurada', detalhe: 'defina CLINICORP_BRIDGE_URL e CLINICORP_BRIDGE_KEY' },
      { status: 503 },
    )
  }

  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      headers: { 'x-api-key': key },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = await upstream.json().catch(() => ({ error: 'resposta inválida da ponte' }))
    return NextResponse.json(body, { status: upstream.status })
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'ponte indisponível', detalhe }, { status: 502 })
  }
}
