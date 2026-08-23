'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { PROFISSIONAIS } from '@/lib/contracts/clinica'
import SeletorDentes from '@/components/SeletorDentes'

/**
 * Preenchimento de um campo direto na folha.
 *
 * Substitui o painel lateral: em vez de procurar o campo numa lista à esquerda
 * e perder de vista onde ele cai no texto, clica-se no próprio espaço em branco
 * do documento e edita ali.
 *
 * Fica ancorado ao span clicado e se reposiciona pra não sair da tela.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export interface CampoAlvo {
  id: string
  label: string
  rect: { top: number; left: number; bottom: number; width: number }
}

export default function CampoPopover({
  alvo, valor, onChange, onFechar, onProximo,
}: {
  alvo: CampoAlvo
  valor: string
  onChange: (v: string) => void
  onFechar: () => void
  onProximo?: () => void
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ top: alvo.rect.bottom + 6, left: alvo.rect.left })

  const tipo = alvo.id === 'profissional' ? 'lista'
    : alvo.id === 'dentes' ? 'dentes'
    : alvo.id === 'mes' ? 'meses'
    : 'texto'

  // Reposiciona depois de medir: um popover que nasce fora da tela é pior que
  // não ter popover nenhum.
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margem = 8
    let left = alvo.rect.left
    let top = alvo.rect.bottom + 6
    if (left + r.width > window.innerWidth - margem) left = window.innerWidth - r.width - margem
    if (left < margem) left = margem
    if (top + r.height > window.innerHeight - margem) top = Math.max(margem, alvo.rect.top - r.height - 6)
    setPos({ top, left })
  }, [alvo])

  useEffect(() => { input.current?.focus(); input.current?.select() }, [alvo.id])

  // Fecha ao clicar fora ou no Esc.
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) onFechar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onFechar() }
    }
    // timeout: sem ele o próprio clique que abriu já fecharia.
    const t = setTimeout(() => document.addEventListener('mousedown', fora), 0)
    document.addEventListener('keydown', tecla)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [onFechar])

  return (
    <div
      ref={caixa}
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[60] bg-white border border-gray-200 rounded shadow-xl print:hidden"
    >
      <div className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold text-teal-800 border-b border-gray-100">
        {alvo.label}
      </div>

      <div className="p-2.5">
        {tipo === 'texto' && (
          <input
            ref={input}
            value={valor}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (onProximo) onProximo(); else onFechar() }
            }}
            className="w-64 h-9 px-2.5 rounded border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
          />
        )}

        {tipo === 'lista' && (
          <ul className="w-72 max-h-64 overflow-y-auto space-y-0.5">
            {PROFISSIONAIS.map(p => (
              <li key={p.cro}>
                <button
                  onClick={() => { onChange(p.nome); onFechar() }}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
                    valor === p.nome
                      ? 'bg-teal-700 text-white'
                      : 'text-gray-700 hover:bg-teal-50 hover:text-teal-800'
                  }`}
                >
                  <span className="flex-1 min-w-0 truncate">{p.nome}</span>
                  <span className={valor === p.nome ? 'text-white/70' : 'text-gray-400'}>
                    CRO {p.cro}
                  </span>
                  {valor === p.nome && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {tipo === 'meses' && (
          <ul className="w-40 max-h-64 overflow-y-auto space-y-0.5">
            {MESES.map(m => (
              <li key={m}>
                <button
                  onClick={() => { onChange(m); onFechar() }}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                    valor.toLowerCase() === m.toLowerCase()
                      ? 'bg-teal-700 text-white'
                      : 'text-gray-700 hover:bg-teal-50 hover:text-teal-800'
                  }`}
                >
                  {m}
                </button>
              </li>
            ))}
          </ul>
        )}

        {tipo === 'dentes' && (
          <div className="w-[19rem]">
            <input
              ref={input}
              value={valor}
              onChange={e => onChange(e.target.value)}
              placeholder="ex.: 16, 26"
              className="w-full h-9 px-2.5 mb-2 rounded border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
            />
            <SeletorDentes valor={valor} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  )
}
