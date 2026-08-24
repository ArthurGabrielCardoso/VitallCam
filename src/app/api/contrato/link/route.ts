/**
 * Gera o link temporário da via assinada, para a recepção mandar ao paciente.
 *
 * Fica no servidor porque o token é assinado com CONTRATO_LINK_SECRET — que não
 * pode chegar ao navegador, senão qualquer um forja link pra qualquer contrato.
 */

import { NextResponse } from 'next/server'
import { assertAllowedOrigin } from '@/lib/r2'
import { SegredoAusenteError, gerarToken } from '@/lib/contrato-link'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request)
    const { id } = await request.json()

    if (!/^[0-9a-f-]{36}$/i.test(id || '')) {
      return NextResponse.json({ error: 'Contrato inválido' }, { status: 400 })
    }

    const base = new URL(request.url).origin
    const url = `${base}/api/contrato/${id}/via?t=${gerarToken(id)}`

    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof SegredoAusenteError) {
      return NextResponse.json(
        {
          error: 'Envio por link não configurado',
          detalhe: 'defina CONTRATO_LINK_SECRET nas variáveis de ambiente',
        },
        { status: 503 },
      )
    }
    console.error('Erro ao gerar link do contrato:', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: message === 'Origem não autorizada' ? 403 : 500 })
  }
}
