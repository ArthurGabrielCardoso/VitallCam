'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { Loader2, ScanLine } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAnexarViaAssinada } from '@/hooks/useContratos'
import { deleteMediaFromR2, uploadMediaToR2 } from '@/lib/r2-client'
import { montarPdfDaVia } from '@/lib/contracts/via-assinada'

interface ViaAssinadaUploadProps {
  contratoId: string
  patientId: string
  /** Rótulo do botão. Sem ele fica só o ícone, para caber no card. */
  label?: string
  className?: string
}

/** No app o botão abre a câmera; no navegador, o seletor de arquivo. */
function temScannerNativo(): boolean {
  return typeof window !== 'undefined'
    && !!window.VitallCam?.isNative?.()
    && typeof window.VitallCam?.escanearDocumento === 'function'
}

/**
 * Anexa o contrato assinado.
 *
 * Dois caminhos pro mesmo lugar: no tablet, o scanner nativo (câmera traseira,
 * recorte e realce); no computador, o PDF que saiu da multifuncional. Em
 * qualquer um dos dois o que sobe é um PDF só, montado por `montarPdfDaVia` —
 * via assinada partida em vários arquivos é como se perde a página 3.
 */
export default function ViaAssinadaUpload({
  contratoId, patientId, label, className = '',
}: ViaAssinadaUploadProps) {
  const inputId = useId()
  const { toast } = useToast()
  const anexar = useAnexarViaAssinada()
  const [processando, setProcessando] = useState(false)
  const [nativo, setNativo] = useState(false)

  // A ponte só aparece quando o WebView dispara 'vitallcam:ready'. Checar só na
  // primeira renderização daria falso negativo e o botão nasceria como seletor
  // de arquivo mesmo dentro do app.
  useEffect(() => {
    const conferir = () => setNativo(temScannerNativo())
    conferir()
    window.addEventListener('vitallcam:ready', conferir)
    return () => window.removeEventListener('vitallcam:ready', conferir)
  }, [])

  const ocupado = processando || anexar.isPending

  /** Monta o PDF, sobe e registra. Comum aos dois caminhos. */
  const enviar = useCallback(async (arquivos: File[]) => {
    setProcessando(true)
    // Guarda a URL, não a chave: é o que `deleteMediaFromR2` sabe interpretar.
    let urlEnviada: string | null = null
    try {
      const { blob, paginas } = await montarPdfDaVia(arquivos)

      const enviado = await uploadMediaToR2({
        patientId,
        mediaType: 'contrato',
        data: blob,
        contentType: 'application/pdf',
      })
      urlEnviada = enviado.url

      await anexar.mutateAsync({ id: contratoId, patientId, key: enviado.key, paginas })

      toast({
        title: 'Via assinada anexada',
        // A contagem só existe quando as páginas foram montadas aqui a partir
        // de imagens; PDF vindo pronto do scanner não declara nada.
        description: paginas
          ? `${paginas} ${paginas === 1 ? 'página' : 'páginas'} na ficha do paciente.`
          : 'Guardada na ficha do paciente.',
      })
    } catch (error) {
      // O arquivo já subiu mas o registro falhou: sem isso fica um PDF órfão no
      // R2 que ninguém nunca mais encontra — mesmo cuidado do ImageUpload.
      if (urlEnviada) {
        deleteMediaFromR2(urlEnviada).catch(err => console.error('Erro ao limpar via assinada:', err))
      }
      toast({
        variant: 'destructive',
        title: 'Não foi possível anexar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      })
      throw error
    } finally {
      setProcessando(false)
    }
  }, [anexar, contratoId, patientId, toast])

  const escanear = useCallback(() => {
    if (ocupado) return

    window.__onDocumentScan = async (urls, erro) => {
      window.__onDocumentScan = undefined

      // Fechar o scanner sem escanear nada não é erro: não vale um toast.
      if (erro === 'cancelled' || (!erro && (!urls || urls.length === 0))) return

      if (erro) {
        toast({
          variant: 'destructive',
          title: 'Scanner',
          description: erro === 'sem-permissao'
            ? 'Permita o acesso à câmera para escanear.'
            : 'Não foi possível abrir a câmera deste aparelho.',
        })
        return
      }

      setProcessando(true)
      try {
        const paginas: File[] = []
        // Em sequência, não em paralelo: são JPEGs grandes e o tablet da
        // recepção não tem folga de memória pra carregar tudo de uma vez.
        for (const url of urls) {
          const nome = url.split('/').pop() || 'pagina.jpg'
          const resposta = await fetch(url)
          const blob = await resposta.blob()
          if (blob.size > 0) paginas.push(new File([blob], nome, { type: 'image/jpeg' }))
          // Já está em memória; deixar no cache do app só ocuparia espaço que
          // ninguém mais sabe limpar.
          window.VitallCam?.deleteCaptureFile?.(nome)
        }
        if (paginas.length === 0) throw new Error('O scanner não devolveu nenhuma página.')
        await enviar(paginas)
      } catch (error) {
        // `enviar` já avisou nos erros dele; aqui só sobra a leitura dos
        // arquivos, que precisa de aviso próprio.
        console.error('Falha ao trazer as páginas do scanner:', error)
      } finally {
        setProcessando(false)
      }
    }

    window.VitallCam?.escanearDocumento?.('window.__onDocumentScan')
  }, [enviar, ocupado, toast])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) await enviar(files).catch(() => {})
  }

  const conteudo = (
    <>
      {ocupado
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <ScanLine className="w-3.5 h-3.5" />}
      {label && <span>{ocupado ? 'Enviando…' : label}</span>}
    </>
  )

  const estilo = `inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${className} ${
    ocupado ? 'opacity-50 pointer-events-none' : ''
  }`

  if (nativo) {
    return (
      <button
        type="button"
        onClick={escanear}
        disabled={ocupado}
        title="Escanear o contrato assinado"
        className={estilo}
      >
        {conteudo}
      </button>
    )
  }

  return (
    <>
      <input
        id={inputId}
        type="file"
        accept="application/pdf,image/*"
        multiple
        onChange={handleFileChange}
        disabled={ocupado}
        className="hidden"
      />
      <label htmlFor={inputId} title="Anexar o contrato assinado, escaneado" className={estilo}>
        {conteudo}
      </label>
    </>
  )
}
