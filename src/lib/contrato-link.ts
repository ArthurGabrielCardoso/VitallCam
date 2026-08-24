import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Link temporário da via assinada, para mandar ao paciente pelo WhatsApp.
 *
 * O contrato tem CPF, endereço e o tratamento planejado: é dado de saúde, e
 * dado de saúde em URL adivinhável é problema de LGPD. O token é um HMAC do id
 * com prazo embutido — não dá pra forjar sem o segredo, e para de funcionar
 * sozinho depois de uma semana, mesmo que a conversa seja encaminhada adiante.
 *
 * Variável (Vercel / .env.local):
 *   CONTRATO_LINK_SECRET  qualquer string longa e aleatória
 */

/** Uma semana: tempo de sobra pro paciente abrir, curto pro link virar arquivo. */
export const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000

export class SegredoAusenteError extends Error {
  constructor() {
    super('CONTRATO_LINK_SECRET não configurado')
  }
}

function assinar(id: string, expira: number): string {
  const segredo = process.env.CONTRATO_LINK_SECRET
  if (!segredo) throw new SegredoAusenteError()
  return createHmac('sha256', segredo).update(`${id}.${expira}`).digest('hex').slice(0, 32)
}

/** Token opaco no formato `<validade em base36>.<assinatura>`. */
export function gerarToken(id: string, agora = Date.now()): string {
  const expira = agora + VALIDADE_MS
  return `${expira.toString(36)}.${assinar(id, expira)}`
}

export type ResultadoToken = 'ok' | 'expirado' | 'invalido'

export function validarToken(id: string, token: string, agora = Date.now()): ResultadoToken {
  const [expiraBase36, assinatura] = (token || '').split('.')
  if (!expiraBase36 || !assinatura) return 'invalido'

  const expira = parseInt(expiraBase36, 36)
  if (!Number.isFinite(expira)) return 'invalido'

  const esperada = assinar(id, expira)
  const a = Buffer.from(assinatura)
  const b = Buffer.from(esperada)
  // Confere a assinatura ANTES do prazo: responder "expirado" a um token
  // forjado entregaria de graça a informação de que o id existe.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalido'

  return expira > agora ? 'ok' : 'expirado'
}
