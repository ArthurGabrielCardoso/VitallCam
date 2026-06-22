'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Clock, Camera, Users, Calendar, Loader2, ArrowLeft, Timer } from 'lucide-react'

type SessionRow = {
  folderId: string
  patientId: string
  patientName: string
  date: string // ISO (created_at da pasta ou 1ª foto)
  photoCount: number
  durationMs: number // span da 1ª à última captura
}

// duração legível: "3m 12s" / "45s" / "1h 04m"
function fmtDuration(ms: number): string {
  if (!ms || ms < 1000) return '—'
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ConfiguracoesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const db = supabase as any
        const [foldersRes, patientsRes, photosRes] = await Promise.all([
          db.from('folders').select('id, name, patient_id, created_at'),
          db.from('patients').select('id, name'),
          db.from('photos').select('folder_id, created_at'),
        ])
        if (foldersRes.error) throw foldersRes.error
        if (patientsRes.error) throw patientsRes.error
        if (photosRes.error) throw photosRes.error

        const patientName = new Map<string, string>()
        for (const p of patientsRes.data || []) patientName.set(p.id, p.name)

        // agrupa fotos por pasta → conta + min/max created_at
        const agg = new Map<string, { count: number; min: number; max: number }>()
        for (const ph of photosRes.data || []) {
          if (!ph.folder_id) continue
          const t = new Date(ph.created_at).getTime()
          const a = agg.get(ph.folder_id)
          if (!a) agg.set(ph.folder_id, { count: 1, min: t, max: t })
          else { a.count++; a.min = Math.min(a.min, t); a.max = Math.max(a.max, t) }
        }

        const rows: SessionRow[] = (foldersRes.data || [])
          .map((f: any): SessionRow | null => {
            const a = agg.get(f.id)
            if (!a) return null // pasta sem fotos não vira sessão
            return {
              folderId: f.id,
              patientId: f.patient_id,
              patientName: patientName.get(f.patient_id) || 'Paciente',
              date: a.min ? new Date(a.min).toISOString() : f.created_at,
              photoCount: a.count,
              durationMs: a.max - a.min,
            }
          })
          .filter((r: SessionRow | null): r is SessionRow => r !== null)
          .sort((x: SessionRow, y: SessionRow) => new Date(y.date).getTime() - new Date(x.date).getTime())

        if (!cancel) setSessions(rows)
      } catch (e: any) {
        if (!cancel) setError(e?.message || 'Falha ao carregar estatísticas')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [])

  const totals = useMemo(() => {
    const totalPhotos = sessions.reduce((s, r) => s + r.photoCount, 0)
    const totalMs = sessions.reduce((s, r) => s + r.durationMs, 0)
    const patients = new Set(sessions.map(r => r.patientId)).size
    return { sessions: sessions.length, totalPhotos, totalMs, patients }
  }, [sessions])

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/patients')}
            className="h-9 w-9 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-700">Configurações</h1>
            <p className="text-sm text-gray-400">Estatísticas das sessões de captura</p>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<Timer className="w-5 h-5" />} label="Sessões" value={String(totals.sessions)} />
          <StatCard icon={<Camera className="w-5 h-5" />} label="Fotos no total" value={String(totals.totalPhotos)} />
          <StatCard icon={<Clock className="w-5 h-5" />} label="Tempo total" value={fmtDuration(totals.totalMs)} />
          <StatCard icon={<Users className="w-5 h-5" />} label="Pacientes" value={String(totals.patients)} />
        </div>

        {/* Lista de sessões */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Histórico de sessões</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin text-teal-500" /> Carregando…
            </div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-500">{error}</div>
          ) : sessions.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">Nenhuma sessão de captura ainda.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* cabeçalho da tabela (desktop) */}
              <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                <span>Paciente</span>
                <span className="text-right w-24">Fotos</span>
                <span className="text-right w-28">Duração</span>
                <span className="text-right w-44">Data</span>
              </div>
              {sessions.map(s => (
                <button
                  key={s.folderId}
                  onClick={() => router.push(`/patients/${s.patientId}?folder=${s.folderId}`)}
                  className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto] gap-2 md:gap-4 px-5 py-3 text-left hover:bg-teal-50/60 transition-colors items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{s.patientName}</p>
                    <p className="md:hidden text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                      <Camera className="w-3 h-3" /> {s.photoCount}
                      <Clock className="w-3 h-3 ml-1" /> {fmtDuration(s.durationMs)}
                    </p>
                  </div>
                  <span className="hidden md:flex items-center justify-end gap-1.5 w-24 text-sm text-gray-600 tabular-nums">
                    <Camera className="w-3.5 h-3.5 text-gray-300" />{s.photoCount}
                  </span>
                  <span className="hidden md:flex items-center justify-end gap-1.5 w-28 text-sm font-medium text-teal-700 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-teal-400" />{fmtDuration(s.durationMs)}
                  </span>
                  <span className="flex items-center justify-end gap-1.5 md:w-44 text-xs md:text-sm text-gray-400 tabular-nums whitespace-nowrap">
                    <Calendar className="w-3.5 h-3.5 hidden md:inline" />{fmtDate(s.date)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
      <div className="flex items-center gap-2 text-teal-600 mb-2">{icon}</div>
      <p className="text-2xl font-semibold text-gray-700 tabular-nums">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}
