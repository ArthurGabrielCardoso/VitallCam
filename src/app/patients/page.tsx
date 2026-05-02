"use client"

export const dynamic = "force-dynamic"

import { useState, useRef, useEffect, useMemo } from "react"
import Link from "next/link"
import { Search, ChevronRight, ImageIcon } from "lucide-react"

import { usePatients, usePatientsBroadcast, usePrefetchPatient } from "@/hooks/usePatients"
import NewPatientModal from "@/components/NewPatientModal"
import IntersectionPrefetch from "@/components/IntersectionPrefetch"
import { useToast } from "@/hooks/use-toast"
import type { Patient } from "@/lib/types"

function getIniciais(nome: string) {
  return nome.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

export default function PatientsPage() {
  const { toast } = useToast()
  const [busca, setBusca] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: pacientes = [], isLoading, error, refetch } = usePatients()
  usePatientsBroadcast()
  const { prefetchPatient } = usePrefetchPatient()

  const handlePatientCreated = () => { refetch() }
  const handleHover = async (id: string) => {
    try { await prefetchPatient(id) } catch { /* silent */ }
  }

  const resultados = useMemo<Patient[]>(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return []
    return pacientes.filter((p) => p.name.toLowerCase().includes(q))
  }, [busca, pacientes])

  useEffect(() => { inputRef.current?.focus() }, [])

  const buscou = busca.trim().length > 0
  const temResultados = buscou && !isLoading && resultados.length > 0
  const semResultados = buscou && !isLoading && resultados.length === 0

  // Scroll do main: bloqueia quando não há resultados
  useEffect(() => {
    document.body.style.overflow = temResultados ? "auto" : "hidden"
    return () => { document.body.style.overflow = "" }
  }, [temResultados])

  if (error) {
    toast({
      variant: "destructive",
      title: "Erro ao carregar pacientes",
      description: "Verifique sua conexão",
    })
  }

  return (
    <div className="relative">

      {/* Logo VitallCam — fixed, decorativo no canto direito */}
      <div
        className="pointer-events-none select-none fixed z-0 opacity-80 flex items-center"
        style={{ height: "calc(100vh - 56px)", top: 56, right: 0, transform: "translateX(12%)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/IconVitall.png"
          alt=""
          aria-hidden
          style={{ height: "80%", width: "auto" }}
          className="object-contain"
        />
      </div>

      {/* Botão canto superior esquerdo — z-20 p/ não ser coberto pelo container central */}
      <div className="absolute top-6 left-6 z-20">
        <NewPatientModal onPatientCreated={handlePatientCreated} />
      </div>

      {/* Conteúdo */}
      <div
        className="relative z-10 flex flex-col items-center justify-center gap-6 px-4"
        style={{ minHeight: "calc(100vh - 56px)" }}
      >
        <div className="flex flex-col items-center gap-0 w-full max-w-2xl -mt-[20vh]">

          {/* Lottie video — exatamente como em /pacientes */}
          <video
            src="/lottie/SearchAnimation.mp4"
            autoPlay
            loop
            muted
            playsInline
            style={{ width: 288, height: 288 }}
            className="object-contain mix-blend-multiply"
          />

          <div className="text-center mt-4">
            <p className="text-2xl font-semibold text-gray-700">Busque por pacientes</p>
            <p className="text-base text-gray-400 mt-1.5">Digite o nome para localizar o cadastro</p>
          </div>

          {/* Input */}
          <div className="relative group w-full mt-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-teal-600 transition-colors pointer-events-none" />
            <input
              ref={inputRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full pl-12 pr-10 py-4 border border-gray-200 rounded focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 outline-none text-base bg-white transition-all placeholder:text-gray-400 shadow-sm"
            />
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              </div>
            )}
          </div>

          {/* Resultados */}
          {temResultados && (
            <div className="w-full mt-5 border border-gray-200 rounded overflow-hidden shadow-sm bg-white">
              {resultados.map((p, idx) => (
                <IntersectionPrefetch key={p.id} patientId={p.id}>
                  <Link
                    href={`/patients/${p.id}`}
                    prefetch={false}
                    onMouseEnter={() => handleHover(p.id)}
                    className={`flex items-center gap-4 px-5 py-3.5 bg-white hover:bg-teal-50 transition-colors group ${idx !== resultados.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center shrink-0 shadow-sm">
                      <span className="text-white font-semibold text-xs tracking-wide">{getIniciais(p.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate leading-snug">{p.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <ImageIcon className="h-3 w-3" />
                          cadastro {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 transition-colors shrink-0" />
                  </Link>
                </IntersectionPrefetch>
              ))}
            </div>
          )}

          {/* Sem resultados */}
          {semResultados && (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-sm font-medium text-gray-500">Nenhum paciente encontrado</p>
              <p className="text-xs text-gray-400">
                para <span className="font-semibold text-gray-600">&quot;{busca}&quot;</span>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
