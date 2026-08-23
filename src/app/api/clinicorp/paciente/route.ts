/**
 * Ponte para o cadastro do Clinicorp.
 *
 * Não fala com o Clinicorp direto: repassa para o VitallWhatsApp, que já tem o
 * login (com 2FA) resolvido. Assim a credencial do Clinicorp fica num lugar só,
 * e o navegador nunca vê a chave da ponte.
 *
 * Variáveis (.env.local):
 *   CLINICORP_BRIDGE_URL  base do VitallWhatsApp, ex.: https://seu-app.up.railway.app
 *   CLINICORP_BRIDGE_KEY  mesmo valor do API_SECRET de lá
 *
 * GET ?nome=arthur       → { pacientes: [{ id, nome, telefone, ativo }] }
 * GET ?id=123            → { paciente: {...ficha completa} }
 * GET ?auto=Nome+Completo → match automático; devolve a ficha só se for
 *                           inequívoco, senão { paciente: null, candidatos }
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const base = process.env.CLINICORP_BRIDGE_URL
  const key = process.env.CLINICORP_BRIDGE_KEY

  if (!base || !key) {
    return NextResponse.json(
      { error: 'ponte não configurada', detalhe: 'defina CLINICORP_BRIDGE_URL e CLINICORP_BRIDGE_KEY' },
      { status: 503 },
    )
  }

  const nome = req.nextUrl.searchParams.get('nome')?.trim()
  const id = req.nextUrl.searchParams.get('id')?.trim()
  const auto = req.nextUrl.searchParams.get('auto')?.trim()

  if (!id && !auto && (!nome || nome.length < 2)) {
    return NextResponse.json({ error: 'informe "nome" (2+ caracteres), "id" ou "auto"' }, { status: 400 })
  }

  const path = id
    ? `/api/pacientes/${encodeURIComponent(id)}`
    : auto
      ? `/api/pacientes/auto?nome=${encodeURIComponent(auto)}`
      : `/api/pacientes/busca?nome=${encodeURIComponent(nome ?? '')}`

  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      headers: { 'x-api-key': key },
      cache: 'no-store',
      // 90s porque a primeira chamada do dia paga o 2FA do Clinicorp (Playwright
      // + código por e-mail, ~60s). Depois o JWT fica em cache e responde em ~1s.
      signal: AbortSignal.timeout(90_000),
    })
    const body = await upstream.json().catch(() => ({ error: 'resposta inválida da ponte' }))
    return NextResponse.json(body, { status: upstream.status })
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'ponte indisponível', detalhe }, { status: 502 })
  }
}
