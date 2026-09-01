'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, Keyboard, Loader2, PackageCheck, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  PacoteComCiclo, RESPONSAVEL_PADRAO, formatarData, hojeLocal, usePacotesDoPaciente, useUsarPacote,
} from '@/hooks/useEsterilizacao'

/**
 * Esterilização na ficha do paciente.
 *
 * Fecha a rastreabilidade que a RDC 1.002/2025 pede: o ciclo diz que dez pacotes
 * foram esterilizados juntos, mas é aqui que se sabe que o pacote 03 daquele
 * ciclo foi aberto neste paciente. Sem este elo, um indicador biológico positivo
 * obriga a avisar todo mundo que passou pela cadeira naquele dia.
 *
 * A leitura é pelo QR impresso na etiqueta, com digitação como alternativa —
 * câmera ruim, luz ruim e adesivo amassado acontecem, e a auxiliar não pode
 * ficar sem registrar por causa disso.
 */
export default function EsterilizacaoPaciente({ patientId }: { patientId: string }) {
  const { toast } = useToast()
  const { data: pacotes, isLoading } = usePacotesDoPaciente(patientId)
  const usar = useUsarPacote()
  const [lendo, setLendo] = useState(false)
  const [codigo, setCodigo] = useState('')

  const registrar = async (valor: string) => {
    const limpo = valor.trim().toUpperCase()
    if (!limpo) return
    try {
      const pacote = await usar.mutateAsync({ codigo: limpo, patientId, por: RESPONSAVEL_PADRAO })
      setCodigo('')
      setLendo(false)
      toast({ title: `Pacote ${pacote.codigo} registrado`, description: 'Ligado a este paciente.' })
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Tente de novo'
      toast({ variant: 'destructive', title: 'Não deu para registrar', description: msg })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setLendo(true)}
          className="flex items-center gap-2 h-10 px-5 rounded text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-sm"
        >
          <Camera className="w-4 h-4" /> Ler etiqueta do pacote
        </button>

        <div className="flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-gray-400" />
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') registrar(codigo) }}
            placeholder="ou digite: 0901-02-03"
            className="h-10 w-48 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
          />
          <button
            onClick={() => registrar(codigo)}
            disabled={!codigo.trim() || usar.isPending}
            className="h-10 px-4 rounded border border-gray-200 text-sm text-gray-600 hover:text-teal-700 hover:border-teal-500 transition-colors disabled:opacity-50"
          >
            {usar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando pacotes…
        </div>
      )}

      {!isLoading && (pacotes || []).length === 0 && (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg bg-white">
          <PackageCheck className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum pacote registrado neste paciente.</p>
          <p className="text-xs text-gray-400 mt-1">
            Leia a etiqueta do grau cirúrgico ao abrir o pacote na cadeira.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(pacotes || []).map((pacote) => <LinhaPacote key={pacote.id} pacote={pacote} />)}
      </div>

      {lendo && <LeitorDeCodigo onLer={registrar} onFechar={() => setLendo(false)} />}
    </div>
  )
}

function LinhaPacote({ pacote }: { pacote: PacoteComCiclo }) {
  const ciclo = pacote.esterilizacao_ciclos
  const vencido = !!ciclo && ciclo.validade < hojeLocal()
  const reprovado = ciclo?.integrador_quimico === 'nao_conforme' || ciclo?.indicador_biologico === 'positivo'

  return (
    <div className="bg-white border border-gray-200 rounded p-4 flex items-start gap-3">
      <div
        className={`h-10 w-10 rounded flex items-center justify-center shrink-0 ${
          reprovado ? 'bg-red-600' : 'bg-gradient-to-br from-teal-600 to-teal-700'
        }`}
      >
        {reprovado ? <AlertTriangle className="w-5 h-5 text-white" /> : <PackageCheck className="w-5 h-5 text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-gray-800">{pacote.codigo}</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {ciclo ? `Esterilizado em ${formatarData(ciclo.data)} · validade ${formatarData(ciclo.validade)}` : 'Ciclo não encontrado'}
          {ciclo?.autoclave ? ` · ${ciclo.autoclave}` : ''}
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {reprovado && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
              Ciclo reprovado
            </span>
          )}
          {ciclo?.liberado_em && !reprovado && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-200">
              Carga liberada
            </span>
          )}
          {vencido && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
              Usado após a validade
            </span>
          )}
          {ciclo?.conteudo && <span className="text-[10px] text-gray-500">{ciclo.conteudo}</span>}
        </div>
      </div>

      {pacote.usado_em && (
        <span className="text-[11px] text-gray-400 shrink-0">
          {new Date(pacote.usado_em).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      )}
    </div>
  )
}

/** O detector de códigos do próprio navegador — nem todo aparelho tem. */
interface DetectorDeCodigo {
  detect: (fonte: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

declare global {
  interface Window {
    BarcodeDetector?: new (opcoes?: { formats?: string[] }) => DetectorDeCodigo
  }
}

/**
 * Leitor do QR da etiqueta.
 *
 * Usa o detector que já vem no navegador (BarcodeDetector), sem biblioteca
 * nova: o app roda em WebView do Chrome, onde ele existe. Onde não existir, a
 * tela diz para digitar o código em vez de fingir que está lendo.
 */
function LeitorDeCodigo({ onLer, onFechar }: { onLer: (codigo: string) => void; onFechar: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const lido = useRef(false)

  const parar = useCallback(() => {
    const fluxo = videoRef.current?.srcObject as MediaStream | null
    fluxo?.getTracks().forEach((faixa) => faixa.stop())
  }, [])

  useEffect(() => {
    let vivo = true
    let temporizador: number | undefined

    const comecar = async () => {
      if (typeof window.BarcodeDetector !== 'function') {
        setErro('Este aparelho não lê QR pela câmera. Digite o código da etiqueta.')
        return
      }
      try {
        const fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        if (!vivo) {
          fluxo.getTracks().forEach((faixa) => faixa.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = fluxo
          await videoRef.current.play()
        }

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const procurar = async () => {
          if (!vivo || lido.current || !videoRef.current) return
          try {
            const achados = await detector.detect(videoRef.current)
            const codigo = achados[0]?.rawValue?.trim()
            if (codigo) {
              lido.current = true
              parar()
              onLer(codigo)
              return
            }
          } catch {
            // Quadro ruim (foco, luz): a próxima passada tenta de novo.
          }
          temporizador = window.setTimeout(procurar, 300)
        }
        procurar()
      } catch {
        setErro('Não consegui abrir a câmera. Libere a permissão ou digite o código.')
      }
    }

    comecar()
    return () => {
      vivo = false
      if (temporizador) window.clearTimeout(temporizador)
      parar()
    }
  }, [onLer, parar])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onFechar}>
      <div
        className="w-full max-w-md bg-white rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Ler etiqueta</h2>
            <p className="text-xs text-gray-400">Aponte para o QR do pacote, a uns 10 cm.</p>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {erro ? (
          <p className="text-sm text-amber-800 bg-amber-50 m-4 p-3 rounded border border-amber-200">{erro}</p>
        ) : (
          <div className="relative bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 border-2 border-white/80 rounded-lg" />
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 px-5 py-3 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Assim que reconhecer, o pacote é ligado a este paciente.
        </p>
      </div>
    </div>
  )
}
