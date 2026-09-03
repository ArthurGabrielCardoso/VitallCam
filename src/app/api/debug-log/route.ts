import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Cliente sem os tipos gerados, só para esta tabela.
 *
 * O `Database` do projeto não declara `Views` nem `Functions`, e sem essas
 * chaves o supabase-js resolve todo `Insert` como `never` — é a mesma razão dos
 * erros de tipo que as RPCs de esterilização carregam. Consertar o tipo do banco
 * inteiro obrigaria a declarar todas as tabelas novas de uma vez; isto aqui é um
 * commit de diagnóstico, então o desvio fica contido em uma linha.
 */
const banco = supabase as unknown as {
  from: (tabela: string) => {
    insert: (valores: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>
    select: (colunas: string) => {
      order: (coluna: string, opcoes: { ascending: boolean }) => {
        limit: (n: number) => Promise<{
          data: { created_at: string; origem: string; trilha: string }[] | null
          error: { code?: string; message?: string } | null
        }>
      }
    }
    delete: () => {
      gte: (coluna: string, valor: string) => Promise<{ error: { message?: string } | null }>
    }
  }
  rpc: (nome: string) => Promise<unknown>
}

export const dynamic = 'force-dynamic'

/**
 * Trilha de diagnóstico da impressão de etiquetas.
 *
 * A versão anterior guardava as linhas num array em memória, apostando que a
 * instância serverless seria reusada entre o POST do app e a minha leitura.
 * Reusa às vezes: a trilha da primeira impressão do dia — que é justamente a
 * que sai em branco — se perdeu inteira, e ficamos sem a única prova de onde o
 * trabalho para. Diagnóstico que some quando é preciso não é diagnóstico.
 *
 * Agora vai para a tabela `diagnostico_impressao`, que atravessa instância,
 * deploy e reinício do aparelho.
 */

/** Sem a tabela, o registro é silencioso: diagnóstico nunca atrapalha impressão. */
function tabelaFaltando(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false
  return erro.code === 'PGRST205'
    || erro.code === '42P01'
    || /diagnostico_impressao/.test(erro.message || '')
}

export async function POST(req: NextRequest) {
  const trilha = await req.text()
  if (!trilha.trim()) return NextResponse.json({ ok: true, ignorado: 'vazio' })

  const origem = /^NAVEGADOR/m.test(trilha) ? 'navegador' : 'app'
  const { error } = await banco
    .from('diagnostico_impressao')
    .insert({ origem, trilha: trilha.slice(0, 20_000) })

  if (error) {
    if (tabelaFaltando(error)) {
      return NextResponse.json({
        ok: false,
        erro: 'rode a migration 20260903_add_diagnostico_impressao.sql',
      })
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  // Guardar para sempre uma ferramenta que só investiga a semana corrente seria
  // lixo acumulando; a limpeza sai de graça aqui.
  await banco.rpc('limpar_diagnostico_impressao').then(() => undefined, () => undefined)
  return NextResponse.json({ ok: true })
}

/** `?n=5` para ver só as últimas cinco. */
export async function GET(req: NextRequest) {
  const pedido = Number(req.nextUrl.searchParams.get('n'))
  const quantas = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, 100) : 20

  const { data, error } = await banco
    .from('diagnostico_impressao')
    .select('created_at, origem, trilha')
    .order('created_at', { ascending: false })
    .limit(quantas)

  if (error) {
    const recado = tabelaFaltando(error)
      ? 'A tabela diagnostico_impressao ainda não existe. Rode a migration 20260903_add_diagnostico_impressao.sql.'
      : `Erro ao ler: ${error.message}`
    return new NextResponse(recado, {
      status: tabelaFaltando(error) ? 200 : 500,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const linhas = data || []
  const texto = linhas.length === 0
    ? '(nenhuma impressão registrada ainda)'
    : linhas
      .map((l) => `===== ${l.created_at} · ${l.origem} =====\n${l.trilha}`)
      .join('\n\n')

  return new NextResponse(texto, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function DELETE() {
  const { error } = await banco.from('diagnostico_impressao').delete().gte('created_at', '1970-01-01')
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
