'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import {
  CicloEsterilizacao, formatarData, formatarHora, hojeLocal, situacaoDoCiclo, useCiclosEsterilizacao,
} from '@/hooks/useEsterilizacao'

/**
 * Livro de registro da CME, para entregar na inspeção.
 *
 * A RDC 1.002/2025 pede registro formal de todos os resultados, para auditoria.
 * Na prática o fiscal quer folhear: uma linha por ciclo, na ordem do mês, com o
 * que aconteceu em cada um. Papel resolve isso melhor que tablet — ninguém
 * entrega o aparelho da clínica na mão de quem está fiscalizando.
 *
 * Sai pela impressão do próprio navegador em vez de gerar PDF no servidor: é uma
 * tabela, o navegador já sabe paginar tabela, e assim a folha sai igual à tela.
 */
export default function LivroEsterilizacaoPage() {
  const router = useRouter()
  const { data: ciclos } = useCiclosEsterilizacao(500)
  const [mes, setMes] = useState(hojeLocal().slice(0, 7))

  const doMes = useMemo(
    () => (ciclos || [])
      .filter((c) => c.data.startsWith(mes))
      .sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero),
    [ciclos, mes],
  )

  const pacotes = doMes.reduce((total, c) => total + (c.quantidade_etiquetas || 0), 0)
  const biologicos = doMes.filter((c) => c.indicador_biologico).length

  return (
    <div className="min-h-full bg-gray-50 p-4 sm:p-6 print:bg-white print:p-0">
      {/* Sem isto o navegador descarta os fundos na impressão e a zebra some
          justamente onde ela mais serve, que é no papel. */}
      <style jsx global>{`
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6 print:hidden">
          <button
            onClick={() => router.push('/patients/esterilizacao')}
            className="h-11 w-11 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 transition-colors shrink-0"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {/* Só o necessário: voltar, escolher o mês, imprimir. O título e o
              subtítulo repetiam o que a folha já diz no próprio cabeçalho. */}
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="flex-1 h-11 sm:h-9 px-3 rounded-lg border border-gray-200 text-base sm:text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
          />
          <button
            onClick={() => window.print()}
            title="Imprimir o livro deste mês"
            className="h-11 w-11 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg bg-teal-700 text-white hover:bg-teal-800 transition-colors shrink-0"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded p-6 print:border-0 print:p-0">
          {/* Papel timbrado: quem recebe o livro na inspeção precisa saber de
              qual clínica ele é sem depender do que foi dito na entrega. */}
          <header className="mb-5 pb-4 border-b-2 border-dourado-400 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/images/logo-doc.png"
              alt="Clínica Vitall"
              className="h-12 w-auto shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-800">
                Registro de esterilização
              </h2>
              <p className="text-xs text-gray-500">
                RDC Anvisa 1.002/2025 · {mesPorExtenso(mes)} · {doMes.length} ciclos ·{' '}
                {pacotes} pacotes · {biologicos} teste(s) biológico(s)
              </p>
            </div>
          </header>

          {doMes.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">Nenhum ciclo neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse text-center">
                <thead>
                  {/* Tudo centralizado: são onze colunas estreitas, e texto
                      alinhado à esquerda em coluna estreita deixa cada célula
                      começando num lugar diferente. */}
                  <tr className="text-center text-dourado-800 bg-dourado-50 border-b-2 border-dourado-300">
                    <th className="py-1.5 px-2">Data</th>
                    <th className="py-1.5 px-2">Hora</th>
                    <th className="py-1.5 px-2">Lote</th>
                    <th className="py-1.5 px-2">Autoclave</th>
                    <th className="py-1.5 px-2">Pacotes</th>
                    <th className="py-1.5 px-2">Validade</th>
                    <th className="py-1.5 px-2">Temp.</th>
                    <th className="py-1.5 px-2">Integrador</th>
                    <th className="py-1.5 px-2">Biológico</th>
                    <th className="py-1.5 px-2">Responsável</th>
                    <th className="py-1.5 px-2">Liberação</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Zebra em dourado claro: numa tabela de onze colunas o olho
                      perde a linha no meio do caminho, e quem confere lê
                      atravessado — data numa linha, biológico na de baixo. */}
                  {doMes.map((ciclo, i) => <Linha key={ciclo.id} ciclo={ciclo} par={i % 2 === 1} />)}
                </tbody>
              </table>
            </div>
          )}

          <footer className="mt-10 pt-6 border-t border-gray-200 grid grid-cols-2 gap-8 text-[11px] text-gray-500">
            <div>
              <div className="h-10" />
              <p className="border-t border-gray-400 pt-1">Responsável técnico</p>
            </div>
            <div>
              <div className="h-10" />
              <p className="border-t border-gray-400 pt-1">Data e assinatura</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

function Linha({ ciclo, par }: { ciclo: CicloEsterilizacao; par: boolean }) {
  const situacao = situacaoDoCiclo(ciclo)
  const texto: Record<string, string> = {
    pendente: 'não conferido',
    liberado: `liberado${ciclo.liberado_por ? ` · ${ciclo.liberado_por}` : ''}`,
    reprovado: 'REPROVADO',
  }

  return (
    <tr
      className={`border-b border-gray-100 ${
        situacao === 'reprovado' ? 'text-red-700 font-medium bg-red-50' : 'text-gray-700'
      } ${par && situacao !== 'reprovado' ? 'bg-dourado-50/60' : ''}`}
    >
      <td className="py-1.5 px-2 whitespace-nowrap">{formatarData(ciclo.data)}</td>
      <td className="py-1.5 px-2">{formatarHora(ciclo.created_at)}</td>
      <td className="py-1.5 px-2 font-semibold">{ciclo.lote}</td>
      <td className="py-1.5 px-2">{ciclo.autoclave || '—'}</td>
      <td className="py-1.5 px-2">{ciclo.quantidade_etiquetas}</td>
      <td className="py-1.5 px-2 whitespace-nowrap">{formatarData(ciclo.validade)}</td>
      <td className="py-1.5 px-2">{ciclo.temperatura ? `${ciclo.temperatura}°C` : '—'}</td>
      <td className="py-1.5 px-2">{rotulo(ciclo.integrador_quimico)}</td>
      <td className="py-1.5 px-2">{rotulo(ciclo.indicador_biologico)}</td>
      <td className="py-1.5 px-2">{ciclo.responsavel}</td>
      <td className="py-1.5 px-2">{texto[situacao]}</td>
    </tr>
  )
}

function rotulo(valor: string | null): string {
  if (!valor) return '—'
  return { conforme: 'conforme', nao_conforme: 'NÃO CONFORME', negativo: 'negativo', positivo: 'POSITIVO' }[valor] ?? valor
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function mesPorExtenso(mes: string): string {
  const [ano, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? mes} de ${ano}`
}
