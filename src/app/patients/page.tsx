'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import NewPatientModal from '@/components/NewPatientModal'
import { Search, User, Loader2, PlayCircle, ArrowUpDown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'
import { usePatients, usePrefetchPatient } from '@/hooks/usePatients'
import IntersectionPrefetch from '@/components/IntersectionPrefetch'

export default function PatientsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'az'>('newest')
  const { toast } = useToast()
  const { data: patients = [], isLoading, error, refetch } = usePatients()
  const { prefetchPatient } = usePrefetchPatient()

  const handlePatientCreated = () => {
    refetch()
  }

  const handlePatientHover = async (patientId: string) => {
    try {
      await prefetchPatient(patientId)
    } catch {
      // Falha silenciosa no prefetch
    }
  }

  const filteredPatients = useMemo(() => {
    let list = searchTerm
      ? patients.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : patients
    if (sortOrder === 'az') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }
    return list
  }, [patients, searchTerm, sortOrder])

  if (error) {
    toast({
      variant: "destructive",
      title: "Erro ao carregar pacientes",
      description: "Verifique sua conexão"
    })
  }

  return (
    <div className="min-h-screen relative patients-main-bg">

      <div className="fixed top-6 left-6 z-50" style={{ position: 'fixed', pointerEvents: 'none' }}>
        <Link
          href="/patients/media"
          style={{ pointerEvents: 'auto' }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground p-4 rounded-full shadow-lg transition-all hover:scale-105 flex items-center justify-center"
        >
          <PlayCircle className="w-6 h-6" />
        </Link>
      </div>

      <div className="fixed top-6 right-6 z-50" style={{ position: 'fixed', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <NewPatientModal onPatientCreated={handlePatientCreated} />
        </div>
      </div>

      {/* Barra de Busca na Parte Inferior */}
      <div className="absolute bottom-0 left-0 right-0 pb-6 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Barra de Busca */}
          <Card className="bg-primary/95 backdrop-blur-sm border-primary/20 shadow-2xl">
            <CardContent className="p-6">
              <div className="flex gap-2 mb-6">
                <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-primary-foreground/70 w-5 h-5" style={{ pointerEvents: 'none' }} />
                <input
                  type="text"
                  name="searchTerm"
                  placeholder="Buscar paciente pelo nome..."
                  defaultValue={searchTerm}
                  onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyUp={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                  style={{
                    pointerEvents: 'auto',
                    WebkitBackfaceVisibility: 'hidden',
                    WebkitTransform: 'translateZ(0)',
                  }}
                  className="pl-12 bg-white/90 border-white/30 text-foreground placeholder:text-muted-foreground text-lg py-6 rounded-xl w-full px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                />
                </div>
                <Button
                  onClick={() => setSortOrder(o => o === 'newest' ? 'az' : 'newest')}
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-3 shrink-0"
                  title={sortOrder === 'newest' ? 'Ordenar A-Z' : 'Ordenar por mais recente'}
                >
                  <ArrowUpDown className="w-4 h-4 mr-1" />
                  {sortOrder === 'newest' ? 'Recente' : 'A-Z'}
                </Button>
              </div>

              {/* Lista de Pacientes - só aparece quando há pesquisa */}
              {searchTerm && (
                <div className="max-h-64 overflow-y-auto space-y-3 w-full">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-primary-foreground" />
                      <span className="ml-2 text-primary-foreground">Carregando pacientes...</span>
                    </div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="text-center py-8">
                      <User className="w-12 h-12 text-primary-foreground/50 mx-auto mb-3" />
                      <p className="text-primary-foreground/80 text-lg">
                        Nenhum paciente encontrado
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredPatients.map((patient) => (
                        <IntersectionPrefetch key={patient.id} patientId={patient.id}>
                          <Link
                            href={`/patients/${patient.id}`}
                            prefetch={true}
                            onMouseEnter={() => handlePatientHover(patient.id)}
                            style={{
                              cursor: 'pointer',
                              pointerEvents: 'auto',
                              position: 'relative',
                              WebkitBackfaceVisibility: 'hidden',
                              WebkitTransform: 'translateZ(0)',
                            }}
                            className="h-auto p-4 bg-white/90 hover:bg-white text-left flex items-center space-x-3 rounded-xl border border-white/20 shadow-sm hover:shadow-md transition-all w-full block"
                          >
                          <div className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-secondary" />
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="font-medium text-foreground">
                              {patient.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(patient.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </Link>
                        </IntersectionPrefetch>
                      ))}
                    </div>
                  )}
                </div>
              )}


            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}