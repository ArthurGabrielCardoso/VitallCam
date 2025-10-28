'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Patient } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  User, 
  Plus, 
  Search, 
  ImageIcon, 
  ChevronRight,
  Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ClinicLogo from './ClinicLogo'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

interface PatientWithPhotoCount extends Patient {
  photo_count: number
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const [patients, setPatients] = useState<PatientWithPhotoCount[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [newPatientName, setNewPatientName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const pathname = usePathname()
  const { toast } = useToast()

  useEffect(() => {
    fetchPatientsWithPhotoCounts()
  }, [])

  const fetchPatientsWithPhotoCounts = async () => {
    try {
      console.log('🔄 Buscando pacientes...')
      
      const { data: patientsData, error: patientsError } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })

      if (patientsError) {
        console.error('❌ Erro ao buscar pacientes:', patientsError)
        throw patientsError
      }

      console.log('✅ Pacientes encontrados:', patientsData?.length || 0)

      const patientsWithCounts = await Promise.all(
        (patientsData || []).map(async (patient) => {
          const { count, error: countError } = await supabase
            .from('photos')
            .select('*', { count: 'exact', head: true })
            .eq('patient_id', patient.id)

          if (countError) {
            console.error('⚠️ Erro ao contar fotos para', patient.name, ':', countError)
            return { ...patient, photo_count: 0 }
          }

          return { ...patient, photo_count: count || 0 }
        })
      )

      setPatients(patientsWithCounts)
      console.log('✅ Pacientes carregados com sucesso')
    } catch (error) {
      console.error('❌ Erro geral:', error)
      toast({
        variant: "destructive",
        title: "Erro de Conexão",
        description: "Verifique se o Supabase está configurado corretamente"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const createPatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPatientName.trim()) {
      toast({
        variant: "destructive",
        title: "Nome obrigatório",
        description: "Por favor, digite o nome do paciente"
      })
      return
    }

    console.log('🔄 Criando paciente:', newPatientName.trim())
    setIsCreating(true)
    
    try {
      const { data, error } = await supabase
        .from('patients')
        .insert([{ name: newPatientName.trim() }])
        .select()
        .single()

      if (error) {
        console.error('❌ Erro ao criar paciente:', error)
        throw error
      }

      console.log('✅ Paciente criado:', data)

      const newPatientWithCount = { ...data, photo_count: 0 }
      setPatients([newPatientWithCount, ...patients])
      setNewPatientName('')
      
      toast({
        title: "✅ Sucesso",
        description: `Paciente "${data.name}" criado com sucesso!`
      })
    } catch (error: any) {
      console.error('❌ Erro completo:', error)
      toast({
        variant: "destructive",
        title: "Erro ao Criar Paciente",
        description: error?.message || "Verifique sua conexão com o Supabase"
      })
    } finally {
      setIsCreating(false)
    }
  }

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const isPatientActive = (patientId: string) => {
    return pathname.includes(`/patients/${patientId}`)
  }

  if (!isOpen) return null

  return (
    <div className="w-80 h-screen bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border bg-primary/5">
        <div className="flex items-center space-x-3">
          <ClinicLogo />
          <div>
            <h1 className="text-lg font-bold text-primary">VitallCam</h1>
            <p className="text-xs text-muted-foreground">Sistema Intraoral</p>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-secondary/10 rounded-lg border border-secondary/20">
          <p className="text-xs text-secondary font-medium">
            📂 Logo da Clínica
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Adicione seu logo em: <br />
            <code className="text-xs bg-muted px-1 rounded">
              /public/assets/images/logo.png
            </code>
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Buscar pacientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* New Patient Form */}
      <div className="p-4 border-b border-border">
        <form onSubmit={createPatient} className="space-y-2">
          <Input
            placeholder="Nome do novo paciente"
            value={newPatientName}
            onChange={(e) => setNewPatientName(e.target.value)}
            disabled={isCreating}
          />
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={isCreating || !newPatientName.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Novo Paciente
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Patients List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-8">
            <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchTerm ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
            </p>
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <Link key={patient.id} href={`/patients/${patient.id}`}>
              <Card 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isPatientActive(patient.id) 
                    ? 'bg-primary/10 border-primary/20 shadow-sm' 
                    : 'hover:bg-muted/50'
                }`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm text-foreground truncate">
                          {patient.name}
                        </h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                            <ImageIcon className="w-3 h-3" />
                            <span>{patient.photo_count}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(patient.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <ChevronRight 
                      className={`w-4 h-4 transition-colors ${
                        isPatientActive(patient.id) ? 'text-primary' : 'text-muted-foreground'
                      }`} 
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Total: {patients.length} pacientes</span>
          <span>Fotos: {patients.reduce((sum, p) => sum + p.photo_count, 0)}</span>
        </div>
      </div>
    </div>
  )
}