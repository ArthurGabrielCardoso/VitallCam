'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, AlertCircle } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useParams } from 'next/navigation'

export default function MediaServicePage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()

  const [countdown, setCountdown] = useState(3)
  const [showBackButton, setShowBackButton] = useState(false)

  const serviceId = params.service as string
  const url = searchParams.get('url') || ''

  // Nome do serviço formatado
  const serviceName = serviceId
    .split(/(?=[A-Z])/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  useEffect(() => {
    // Salvar no localStorage que veio do app
    if (typeof window !== 'undefined') {
      localStorage.setItem('vitallcam_return', '/patients/media')
    }

    // Countdown antes de redirecionar
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      // Redirecionar para o serviço
      window.location.href = url
    }
  }, [countdown, url])

  const handleBack = () => {
    router.push('/patients/media')
  }

  const handleOpenNow = () => {
    window.location.href = url
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center p-6">
      {/* Botão Voltar Fixo - Grande e Visível */}
      <button
        onClick={handleBack}
        className="fixed top-6 left-6 z-50 bg-white hover:bg-white/90 text-primary p-4 rounded-full shadow-2xl transition-all hover:scale-110 flex items-center gap-2"
      >
        <ArrowLeft className="w-6 h-6" />
        <span className="font-semibold">Voltar</span>
      </button>

      {/* Conteúdo Central */}
      <div className="max-w-lg mx-auto text-center">
        {/* Título */}
        <h1 className="text-4xl font-bold text-white mb-8">
          {serviceName}
        </h1>

        {/* Countdown */}
        <div className="mb-8">
          <div className="text-7xl font-bold text-white mb-4">
            {countdown}
          </div>
          <p className="text-white/80 text-xl">
            Redirecionando automaticamente...
          </p>
        </div>

        {/* Botão Abrir Agora */}
        <button
          onClick={handleOpenNow}
          className="bg-white hover:bg-white/90 text-primary px-12 py-5 rounded-full text-xl font-bold transition-all hover:scale-105 shadow-2xl mb-8"
        >
          Abrir Agora
        </button>

        {/* Info Card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <p className="text-white/90 text-lg font-semibold mb-2">
            Para voltar ao aplicativo:
          </p>
          <p className="text-white/70 text-base">
            Use o botão "Voltar" do navegador ou clique no botão no canto superior esquerdo
          </p>
        </div>
      </div>
    </div>
  )
}
