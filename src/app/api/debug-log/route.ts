import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Buffer em memória pra sessão de debug. Fluid Compute reusa a instância,
// então um POST do app e um GET meu (poucos minutos depois) caem na mesma.
type Entry = { t: string; body: string }
const store: Entry[] =
  (globalThis as unknown as { __vcDebug?: Entry[] }).__vcDebug ??
  ((globalThis as unknown as { __vcDebug?: Entry[] }).__vcDebug = [])

export async function POST(req: NextRequest) {
  const body = await req.text()
  store.push({ t: new Date().toISOString(), body })
  if (store.length > 80) store.splice(0, store.length - 80)
  return NextResponse.json({ ok: true, count: store.length })
}

export async function GET() {
  const text =
    store.length === 0
      ? '(vazio — nenhum log recebido ainda)'
      : store.map((e) => `===== ${e.t} =====\n${e.body}`).join('\n\n')
  return new NextResponse(text, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

// Limpa o buffer (chamo antes de um novo teste)
export async function DELETE() {
  store.length = 0
  return NextResponse.json({ ok: true })
}
