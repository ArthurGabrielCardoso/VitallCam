'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ScanLine, Search, Loader2, ExternalLink, ImageOff, ArrowLeft, Calendar,
} from 'lucide-react'

/**
 * Radiografias e tomografias do paciente.
 *
 * Os exames chegam por e-mail na caixa da radiologia; o VitallWhatsApp guarda
 * os metadados e o VitallCam lê por /api/radiografias. As imagens não são
 * hospedadas por nós — as URLs do Google Storage expiram, então cada abertura
 * busca de novo no portal. Por isso o detalhe tem carregamento próprio em vez
 * de vir junto com a lista.
 */

interface ExameResumo {
  id: number
  fonte: 'cfaz' | 'idoc'
  paciente: string
  procedimento: string | null
  data: string | null
  numRadiografias: number
  numFotos: number
  pedido: number | null
}

interface Imagem { id: number; url: string; segmento: number | null }

interface ExameDetalhe {
  id: number
  source: 'cfaz' | 'idoc'
  paciente: string
  data: string | null
  pedido?: number | null
  procedimento?: string | null
  codigo?: string | null
  accessUrl?: string | null
  shareUrl?: string | null
  radiografias: Imagem[]
  fotos: Imagem[]
}

/** Clínica de origem — mesma identificação usada no inbox. */
const CLINICA: Record<'cfaz' | 'idoc', { nome: string; cls: string }> = {
  cfaz: { nome: 'Radiologic', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  idoc: { nome: 'Cedor', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
}

/** "2026-06-29T09:18" → "29/06/2026 09:18" */
function fmtData(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return iso
  const [, y, mo, d, h, mi] = m
  return `${d}/${mo}/${y}${h ? ` ${h}:${mi}` : ''}`
}

function tituloCaso(nome: string): string {
  // Sem \p{L}: o target deste projeto é anterior a ES6 e não aceita a flag /u.
  return (nome || '')
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
}

export default function RadiografiasPanel({ patientName }: { patientName?: string }) {
  const [exames, setExames] = useState<ExameResumo[]>([])
  const [aproximados, setAproximados] = useState<ExameResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [modoBusca, setModoBusca] = useState(false)
  const [selId, setSelId] = useState<number | null>(null)

  const carregar = useCallback(async (qs: string) => {
    setCarregando(true); setErro(null)
    try {
      const r = await fetch(`/api/radiografias${qs}`)
      const body = await r.json()
      if (!r.ok) { setErro(body?.detalhe || body?.error || 'Não foi possível carregar.'); return }
      setExames(body.exames ?? [])
      setAproximados(body.aproximados ?? [])
    } catch {
      setErro('Falha de conexão.')
    } finally {
      setCarregando(false)
    }
  }, [])

  // Ao abrir, mostra os exames deste paciente (match de nome no backend).
  useEffect(() => {
    if (modoBusca) return
    const nome = (patientName || '').trim()
    carregar(nome.length >= 3 ? `?nome=${encodeURIComponent(nome)}` : '')
  }, [patientName, modoBusca, carregar])

  const buscar = () => {
    const q = busca.trim()
    if (!q) { setModoBusca(false); return }
    setModoBusca(true)
    carregar(`?busca=${encodeURIComponent(q)}`)
  }

  const voltarAoPaciente = () => {
    setBusca(''); setModoBusca(false); setSelId(null)
  }

  if (selId != null) {
    return <Detalhe id={selId} onVoltar={() => setSelId(null)} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
            placeholder="Buscar exame de outro paciente"
            className="w-full h-10 pl-10 pr-3 rounded border border-gray-200 bg-white text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors"
          />
        </div>
        {modoBusca && (
          <button
            onClick={voltarAoPaciente}
            className="h-10 px-3 rounded border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-teal-400 hover:text-teal-700 transition-colors shrink-0"
          >
            Voltar aos exames do paciente
          </button>
        )}
      </div>

      {carregando && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {!carregando && erro && (
        <div className="border border-dashed border-gray-200 rounded py-12 text-center">
          <ImageOff className="w-7 h-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{erro}</p>
        </div>
      )}

      {!carregando && !erro && exames.length === 0 && aproximados.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded py-12 text-center">
          <ScanLine className="w-8 h-8 text-gray-300 mx-auto mb-2" strokeWidth={1.3} />
          <p className="text-sm text-gray-500">
            {modoBusca
              ? 'Nenhum exame encontrado para essa busca.'
              : 'Nenhum exame de radiologia para este paciente.'}
          </p>
          {!modoBusca && (
            <p className="text-xs text-gray-400 mt-1">
              Os exames aparecem aqui quando a radiologia envia o e-mail.
            </p>
          )}
        </div>
      )}

      {!carregando && exames.length > 0 && (
        <Lista exames={exames} onAbrir={setSelId} />
      )}

      {/* Quando o nome não fecha exatamente, mostra separado — nunca misturado
          com os confirmados, pra ninguém abrir a radiografia do paciente errado
          achando que é a certa. */}
      {!carregando && exames.length === 0 && aproximados.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-amber-700">
            Não achei exame com esse nome exato. Estes têm nome parecido — confira antes de abrir:
          </p>
          <Lista exames={aproximados} onAbrir={setSelId} />
        </div>
      )}
    </div>
  )
}

function Lista({ exames, onAbrir }: { exames: ExameResumo[]; onAbrir: (id: number) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {exames.map(e => (
        <button
          key={e.id}
          onClick={() => onAbrir(e.id)}
          className="text-left bg-white border border-gray-200 rounded shadow-sm p-4 hover:bg-teal-50 hover:border-teal-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center shrink-0 shadow-sm">
              <ScanLine className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-800 group-hover:text-teal-700 transition-colors leading-snug truncate">
                {tituloCaso(e.paciente)}
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {fmtData(e.data) || 'sem data'}
              </p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CLINICA[e.fonte].cls}`}>
                  {CLINICA[e.fonte].nome}
                </span>
                {e.numRadiografias > 0 && (
                  <span className="text-[10px] text-gray-500">{e.numRadiografias} rx</span>
                )}
                {e.numFotos > 0 && (
                  <span className="text-[10px] text-gray-500">{e.numFotos} fotos</span>
                )}
              </div>
              {e.procedimento && (
                <p className="text-[11px] text-gray-400 mt-1 truncate">{tituloCaso(e.procedimento)}</p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

function Detalhe({ id, onVoltar }: { id: number; onVoltar: () => void }) {
  const [data, setData] = useState<ExameDetalhe | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(null); setData(null)
    fetch(`/api/radiografias/${id}`)
      .then(async r => {
        const body = await r.json()
        if (!vivo) return
        if (!r.ok) setErro(body?.detalhe || body?.error || 'Falha ao carregar')
        else setData(body)
      })
      .catch(() => { if (vivo) setErro('Falha de conexão.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [id])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onVoltar}
          className="h-9 px-3 rounded border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-teal-400 hover:text-teal-700 transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>
        {data && (
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-800 truncate">{tituloCaso(data.paciente)}</h2>
            <p className="text-xs text-gray-400">
              {data.procedimento ? `${tituloCaso(data.procedimento)} · ` : ''}
              {fmtData(data.data)}
              {data.pedido ? ` · pedido #${data.pedido}` : ''}
              {data.codigo ? ` · cód. ${data.codigo}` : ''}
            </p>
          </div>
        )}
        {data?.shareUrl && (
          <a
            href={data.shareUrl} target="_blank" rel="noreferrer"
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 shrink-0"
          >
            Portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {carregando && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {erro && (
        <div className="border border-dashed border-gray-200 rounded py-12 text-center">
          <ImageOff className="w-7 h-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{erro}</p>
        </div>
      )}

      {/* iDoc guarda tudo (PDF/DICOM) atrás do portal deles; só dá pra linkar. */}
      {data?.source === 'idoc' && (
        <div className="max-w-md mx-auto text-center py-10 flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-lg bg-dourado-500/15 grid place-items-center">
            <ScanLine className="w-7 h-7 text-dourado-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800">Documentação no iDoc / RadioMemory</p>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              As imagens deste exame ficam no portal do iDoc. O botão abaixo abre direto,
              sem precisar de login.
            </p>
          </div>
          {data.accessUrl ? (
            <a
              href={data.accessUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm px-5 py-2.5 rounded transition-colors"
            >
              Abrir documentação <ExternalLink className="w-4 h-4" />
            </a>
          ) : (
            <p className="text-sm text-gray-400">Link de acesso indisponível.</p>
          )}
        </div>
      )}

      {data?.source === 'cfaz' && (
        <>
          <Secao titulo="Radiografias" imagens={data.radiografias} destaque />
          <Secao titulo="Fotos" imagens={data.fotos} />
          {data.radiografias.length === 0 && data.fotos.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Nenhuma imagem neste pedido.</p>
          )}
        </>
      )}
    </div>
  )
}

function Secao({ titulo, imagens, destaque }: { titulo: string; imagens: Imagem[]; destaque?: boolean }) {
  if (imagens.length === 0) return null
  return (
    <section>
      <h3 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${destaque ? 'text-teal-700' : 'text-gray-400'}`}>
        {titulo} <span className="text-gray-300">({imagens.length})</span>
      </h3>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {imagens.map(img => (
          <a
            key={img.id} href={img.url} target="_blank" rel="noreferrer"
            className="block border border-gray-200 rounded overflow-hidden bg-black hover:border-teal-500 transition-colors"
            style={{ aspectRatio: '4/3' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url} alt={titulo} loading="lazy"
              className="w-full h-full object-contain"
            />
          </a>
        ))}
      </div>
    </section>
  )
}
