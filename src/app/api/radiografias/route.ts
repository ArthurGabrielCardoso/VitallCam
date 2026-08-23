/**
 * Exames de radiologia do paciente (Cfaz / iDoc), via VitallWhatsApp.
 *
 * GET ?nome=Fulano de Tal → exames desse paciente (match de nome no backend)
 * GET ?busca=fulano       → busca livre, pro campo de pesquisa
 * GET                     → últimos exames que chegaram
 */

import { NextRequest } from 'next/server'
import { chamarPonte } from '@/lib/bridge'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get('nome')?.trim()
  const busca = req.nextUrl.searchParams.get('busca')?.trim()

  const qs = nome
    ? `?nome=${encodeURIComponent(nome)}`
    : busca
      ? `?busca=${encodeURIComponent(busca)}`
      : ''

  return chamarPonte(`/api/radiografias${qs}`)
}
