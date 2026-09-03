import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Zera os ciclos e pacotes de esterilização de teste.
 *
 * Utilitário de uso único, pedido pelo Arthur pra limpar os dados de teste
 * antes de a clínica começar a usar de verdade. `esterilizacao_pacotes` tem
 * `ON DELETE CASCADE` em `ciclo_id`, então apagar os ciclos já leva os
 * pacotes junto — não precisa das duas tabelas separadas.
 *
 * Sem tipos gerados pro `Database` (mesma lacuna de `debug-log/route.ts`):
 * o desvio fica contido aqui, num arquivo que sai do repo depois de usado.
 */
const banco = supabase as unknown as {
  from: (tabela: string) => {
    select: (colunas: string, opcoes: { count: 'exact'; head: true }) => Promise<{
      count: number | null
      error: { message?: string } | null
    }>
    delete: () => {
      gte: (coluna: string, valor: string) => Promise<{ error: { message?: string } | null }>
    }
  }
}

async function contar(tabela: string): Promise<number> {
  const { count } = await banco.from(tabela).select('id', { count: 'exact', head: true })
  return count ?? 0
}

export async function DELETE(req: NextRequest) {
  if (req.nextUrl.searchParams.get('confirmar') !== 'zerar') {
    return NextResponse.json({ ok: false, erro: 'passe ?confirmar=zerar' }, { status: 400 })
  }

  const ciclosAntes = await contar('esterilizacao_ciclos')
  const pacotesAntes = await contar('esterilizacao_pacotes')

  const { error } = await banco.from('esterilizacao_ciclos').delete().gte('created_at', '1970-01-01')
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, apagados: { ciclos: ciclosAntes, pacotes: pacotesAntes } })
}
