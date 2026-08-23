/**
 * Ponte para o cadastro do Clinicorp.
 *
 * Não fala com o Clinicorp direto: repassa para o VitallWhatsApp, que já tem o
 * login (com 2FA) resolvido. Assim a credencial do Clinicorp fica num lugar só,
 * e o navegador nunca vê a chave da ponte.
 *
 * GET ?nome=arthur        → { pacientes: [{ id, nome, telefone, ativo }] }
 * GET ?id=123             → { paciente: {...ficha completa} }
 * GET ?auto=Nome+Completo → match automático; devolve a ficha só se for
 *                           inequívoco, senão { paciente: null, candidatos }
 */

import { NextRequest, NextResponse } from 'next/server'
import { chamarPonte } from '@/lib/bridge'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
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

  return chamarPonte(path)
}
