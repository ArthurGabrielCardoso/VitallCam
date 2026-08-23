/**
 * Detalhe de um exame, com as imagens.
 *
 * As URLs das imagens vêm do Google Storage e expiram, então nada é guardado:
 * cada abertura busca de novo no Cfaz. Por isso esta rota nunca é cacheada.
 */

import { NextRequest } from 'next/server'
import { chamarPonte } from '@/lib/bridge'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return chamarPonte(`/api/radiografias/${encodeURIComponent(params.id)}`)
}
