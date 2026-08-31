"use client"

import { cn } from "@/lib/utils"
import {
  UserRound,
  PanelLeftClose,
  Search,
  Settings,
  Home,
  PlayCircle,
  FileSignature,
  ScanLine,
  Biohazard,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useMemo } from "react"

type NavItem = {
  name: string
  href: string
  icon: typeof UserRound
}

const navigation: NavItem[] = [
  { name: "Início",        href: "/patients",               icon: Home          },
  { name: "Pacientes",     href: "/patients",               icon: UserRound     },
  { name: "Radiografias",  href: "/patients/radiografias",  icon: ScanLine      },
  { name: "Esterilização", href: "/patients/esterilizacao", icon: Biohazard     },
  { name: "Contratos",     href: "/patients/contratos",     icon: FileSignature },
  { name: "Mídia",         href: "/patients/media",         icon: PlayCircle    },
]

export function SidebarNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")

  // "/patients" é prefixo das demais rotas — vence sempre o item mais
  // específico, senão dois itens acenderiam ao mesmo tempo. Início e Pacientes
  // apontam para o mesmo lugar, então o empate é desfeito pelo último da lista:
  // em /patients quem acende é "Pacientes", que é o nome do que está na tela.
  const activeHref = useMemo(() => {
    const matches = navigation
      .map((item, ordem) => ({ item, ordem }))
      .filter(({ item }) => pathname === item.href || pathname?.startsWith(item.href + "/"))
      .sort((a, b) => b.item.href.length - a.item.href.length || b.ordem - a.ordem)
    return matches[0]?.item.href ?? null
  }, [pathname])

  const visibleNavigation = useMemo(() => {
    if (!search.trim()) return navigation
    return navigation.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [search])

  useEffect(() => {
    const savedState = localStorage.getItem("sidebar-collapsed")
    setIsOpen(savedState === "false")

    const handleOpen = () => {
      setIsOpen(true)
      localStorage.setItem("sidebar-collapsed", "false")
    }
    window.addEventListener("sidebar-open", handleOpen)
    return () => window.removeEventListener("sidebar-open", handleOpen)
  }, [])

  const toggleSidebar = () => {
    const newState = !isOpen
    setIsOpen(newState)
    setSearch("")
    localStorage.setItem("sidebar-collapsed", String(!newState))
    window.dispatchEvent(new Event("sidebar-toggle"))
  }

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 backdrop-blur-sm"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out",
          "bg-teal-800 shadow-2xl border-r border-teal-900/40",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full">

          {/* Header — Início + botão fechar */}
          <div className="h-14 px-4 border-b border-teal-900/40 flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
            <Link
              href="/patients"
              onClick={toggleSidebar}
              className="flex items-center gap-2 text-sm font-semibold text-white hover:text-teal-200 transition-colors truncate"
            >
              <Home className="h-4 w-4 shrink-0" />
              Início
            </Link>
            <button
              onClick={toggleSidebar}
              className="flex items-center justify-center h-9 w-9 rounded hover:bg-teal-700 transition-colors shrink-0"
              title="Fechar menu"
            >
              <PanelLeftClose className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar módulo..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-teal-700/60 border border-teal-600/40 text-sm text-white placeholder:text-teal-400 focus:outline-none focus:border-teal-400 focus:bg-teal-700 transition-all"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-hidden">
            {visibleNavigation.length > 0 ? (
              visibleNavigation.map((item) => {
                const isActive = item.href === activeHref
                const Icon = item.icon

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={toggleSidebar}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded transition-all duration-200",
                      isActive
                        ? "bg-white/15 shadow-lg backdrop-blur-sm border border-white/10"
                        : "text-teal-200 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 flex-shrink-0 transition-colors",
                        isActive ? "text-dourado-400" : "text-teal-300",
                      )}
                    />
                    <span className={cn("font-medium text-sm", isActive ? "text-dourado-400" : "")}>
                      {item.name}
                    </span>
                  </Link>
                )
              })
            ) : (
              <p className="px-3 py-4 text-xs text-teal-400 text-center">Nenhum módulo encontrado</p>
            )}
          </nav>

          {/* Footer — Configurações */}
          <div className="p-3 border-t border-teal-900/40">
            <Link
              href="/patients"
              onClick={toggleSidebar}
              className="flex items-center gap-3 px-3 py-3 rounded text-teal-200 hover:bg-white/10 hover:text-white transition-all duration-200"
            >
              <Settings className="h-5 w-5 flex-shrink-0 text-teal-300" />
              <span className="font-medium text-sm">Configurações</span>
            </Link>
          </div>

        </div>
      </aside>
    </>
  )
}
