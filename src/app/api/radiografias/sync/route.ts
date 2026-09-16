/**
 * Varredura sob demanda da caixa da radiologia (botão "Atualizar").
 *
 * O VitallWhatsApp é quem lê o e-mail; aqui só repassamos o pedido, porque a
 * chave da ponte não pode chegar ao navegador.
 */

import { chamarPonte } from '@/lib/bridge'

export const dynamic = 'force-dynamic'

export async function POST() {
  return chamarPonte('/api/radiografias/sync', 'POST')
}
