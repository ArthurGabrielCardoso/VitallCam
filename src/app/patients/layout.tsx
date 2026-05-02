"use client"

import type React from "react"
import { Suspense } from "react"
import { SidebarNav } from "@/components/SidebarNav"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, useMemo, useRef } from "react"
import { PanelLeftOpen, Search, Settings, ChevronRight, ArrowLeft, ImageIcon } from "lucide-react"
import Link from "next/link"
import { usePatients, usePatientsBroadcast } from "@/hooks/usePatients"
import type { Patient } from "@/lib/types"

function getIniciais(nome: string) {
  return nome.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

const ROUTE_LABELS: Record<string, string> = {
  "/patients":       "Pacientes",
  "/patients/media": "Mídia",
  "/camera-debug":   "Câmera",
}

function getRouteLabel(path: string) {
  if (!path) return "Voltar"
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path]
  const match = Object.entries(ROUTE_LABELS).find(([route]) =>
    route !== "/" && path.startsWith(route + "/")
  )
  return match ? match[1] : "Voltar"
}

function PatientsLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const [isClient, setIsClient] = useState(false)
  const prevPathRef = useRef<string | null>(null)
  const [prevPath, setPrevPath] = useState<string | null>(null)

  const [busca, setBusca] = useState("")
  const searchRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  // Pacientes vêm do hook (Supabase + react-query) — busca filtra em memória
  const { data: pacientes = [], isLoading } = usePatients()
  usePatientsBroadcast()

  useEffect(() => { setIsClient(true) }, [])

  // Rastreia rota anterior
  useEffect(() => {
    if (!isClient) return
    const prev = prevPathRef.current
    if (prev !== null && prev !== pathname) setPrevPath(prev)
    prevPathRef.current = pathname
  }, [pathname, isClient])

  // Quando estamos numa seção interna do perfil (?tab=...), o "voltar" leva ao perfil em vez da rota anterior
  const showBackToProfile = isClient && !!tabParam
  const showBack = isClient && pathname !== "/patients" && prevPath !== null && !showBackToProfile

  const handleOpenSidebar = () => {
    window.dispatchEvent(new Event("sidebar-open"))
  }

  // Filtro local
  const resultados = useMemo<Patient[]>(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return []
    return pacientes.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [busca, pacientes])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setBusca("")
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const buscou = open && busca.trim().length > 0
  const temResultados = buscou && !isLoading && resultados.length > 0
  const semResultados = buscou && !isLoading && resultados.length === 0

  if (!isClient) {
    return <div className="min-h-screen bg-background">{children}</div>
  }

  return (
    <div className="h-screen bg-background overflow-hidden">
      <SidebarNav />
      {/* Header fixo */}
      <header className="sticky top-0 z-20 bg-teal-800 border-b border-teal-900/40 shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
        <div className="relative flex items-center h-14 px-4 lg:px-6">

          {/* Abrir sidebar */}
          <button
            onClick={handleOpenSidebar}
            className="flex items-center justify-center h-9 w-9 rounded hover:bg-teal-700 transition-colors shrink-0"
            title="Abrir menu"
          >
            <PanelLeftOpen className="h-5 w-5 text-white" />
          </button>

          {/* Voltar ao perfil — quando dentro de uma seção interna (?tab=...) */}
          {showBackToProfile && (
            <button
              onClick={() => router.push(pathname)}
              className="flex items-center gap-1.5 h-9 px-2 rounded hover:bg-teal-700 transition-colors shrink-0 text-white"
              title="Voltar ao perfil"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Perfil</span>
            </button>
          )}

          {/* Voltar — exceto em /patients raiz */}
          {showBack && (
            <button
              onClick={() => router.push(prevPath!)}
              className="flex items-center gap-1.5 h-9 px-2 rounded hover:bg-teal-700 transition-colors shrink-0 text-white"
              title={`Voltar para ${getRouteLabel(prevPath!)}`}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">{getRouteLabel(prevPath!)}</span>
            </button>
          )}

          {/* Busca de pacientes — centralizada absolutamente */}
          <div ref={searchRef} className="absolute left-1/2 -translate-x-1/2 w-full max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-300 pointer-events-none" />
              <input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
                placeholder="Pesquisar pacientes..."
                className="w-full pl-9 pr-8 py-2 rounded bg-teal-700/60 border border-teal-600/50 text-sm text-white placeholder:text-teal-300 focus:outline-none focus:border-teal-300 focus:bg-teal-700 transition-all"
              />
              {isLoading && busca.trim() && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
            </div>

            {/* Dropdown de resultados */}
            {(temResultados || semResultados) && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 overflow-hidden">
                {temResultados && resultados.map((p, idx) => (
                  <Link
                    key={p.id}
                    href={`/patients/${p.id}`}
                    onClick={() => { setBusca(""); setOpen(false) }}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-teal-50 transition-colors group ${idx !== resultados.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center shrink-0 shadow-sm">
                      <span className="text-white font-semibold text-xs tracking-wide">{getIniciais(p.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                      <div className="flex items-center gap-3 flex-wrap mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <ImageIcon className="h-3 w-3" />
                          cadastro {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 transition-colors shrink-0" />
                  </Link>
                ))}
                {semResultados && (
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">
                    Nenhum paciente encontrado para{" "}
                    <span className="font-semibold text-gray-600">&quot;{busca}&quot;</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ações direita */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Link
              href="/patients"
              className="flex items-center justify-center h-9 w-9 rounded hover:bg-teal-700 transition-colors"
              title="Configurações"
            >
              <Settings className="h-5 w-5 text-white" />
            </Link>

            {/* Logo do app — fundo branco redondo */}
            <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center shadow-sm overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/vitall-logo.png" alt="VitallCam" className="h-6 w-6 object-contain" />
            </div>
          </div>

        </div>
      </header>
      <main className="h-[calc(100vh-3.5rem)] overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

export default function PatientsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background">{children}</div>}>
      <PatientsLayoutContent>{children}</PatientsLayoutContent>
    </Suspense>
  )
}
