export interface Database {
  public: {
    Tables: {
      patients: {
        Row: {
          id: string
          name: string
          created_at: string
          profile_photo?: string | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          profile_photo?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          profile_photo?: string | null
        }
      }
      photos: {
        Row: {
          id: string
          patient_id: string
          image_data?: string
          created_at: string
          folder_id?: string
          image_number?: number
        }
        Insert: {
          id?: string
          patient_id: string
          image_data: string
          created_at?: string
          folder_id?: string
          image_number?: number
        }
        Update: {
          id?: string
          patient_id?: string
          image_data?: string
          created_at?: string
          folder_id?: string
          image_number?: number
        }
      }
      folders: {
        Row: {
          id: string
          name: string
          patient_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          patient_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          patient_id?: string
          created_at?: string
        }
      }
      transcriptions: {
        Row: {
          id: string
          patient_id: string
          text: string
          started_at: string
          ended_at?: string
          duration_seconds?: number
          status: 'active' | 'completed' | 'error'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          text: string
          started_at: string
          ended_at?: string
          duration_seconds?: number
          status?: 'active' | 'completed' | 'error'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          text?: string
          started_at?: string
          ended_at?: string
          duration_seconds?: number
          status?: 'active' | 'completed' | 'error'
          created_at?: string
          updated_at?: string
        }
      }
      transcription_segments: {
        Row: {
          id: string
          transcription_id: string
          text: string
          timestamp_start: number
          timestamp_end: number
          confidence?: number
          speaker?: string
          sequence_number: number
          created_at: string
        }
        Insert: {
          id?: string
          transcription_id: string
          text: string
          timestamp_start: number
          timestamp_end: number
          confidence?: number
          speaker?: string
          sequence_number: number
          created_at?: string
        }
        Update: {
          id?: string
          transcription_id?: string
          text?: string
          timestamp_start?: number
          timestamp_end?: number
          confidence?: number
          speaker?: string
          sequence_number?: number
          created_at?: string
        }
      }
      anamneses: {
        Row: {
          id: string
          patient_id: string
          nome: string
          endereco?: string
          telefone?: string
          telefone_auxiliar?: string
          email?: string
          instagram?: string
          dados_saude: Record<string, any>
          assinatura?: string
          template_id?: string | null
          template_name?: string | null
          template_snapshot?: Record<string, any> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          nome: string
          endereco?: string
          telefone?: string
          telefone_auxiliar?: string
          email?: string
          instagram?: string
          dados_saude: Record<string, any>
          assinatura?: string
          template_id?: string | null
          template_name?: string | null
          template_snapshot?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          nome?: string
          endereco?: string
          telefone?: string
          telefone_auxiliar?: string
          email?: string
          instagram?: string
          dados_saude?: Record<string, any>
          assinatura?: string
          template_id?: string | null
          template_name?: string | null
          template_snapshot?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
      }
      anamnese_templates: {
        Row: {
          id: string
          name: string
          description?: string | null
          questions: import('./anamnese-templates').AnamneseQuestion[]
          is_default: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          questions: import('./anamnese-templates').AnamneseQuestion[]
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          questions?: import('./anamnese-templates').AnamneseQuestion[]
          is_default?: boolean
          is_active?: boolean
          updated_at?: string
        }
      }
    }
  }
}

export type Patient = Database['public']['Tables']['patients']['Row']
export type Photo = Database['public']['Tables']['photos']['Row']
export type Folder = Database['public']['Tables']['folders']['Row']
export type Transcription = Database['public']['Tables']['transcriptions']['Row']
export type TranscriptionSegment = Database['public']['Tables']['transcription_segments']['Row']
export type Anamnese = Database['public']['Tables']['anamneses']['Row']
export type AnamneseTemplate = Database['public']['Tables']['anamnese_templates']['Row']
export type NewPatient = Database['public']['Tables']['patients']['Insert']
export type NewPhoto = Database['public']['Tables']['photos']['Insert']
export type NewFolder = Database['public']['Tables']['folders']['Insert']
export type NewTranscription = Database['public']['Tables']['transcriptions']['Insert']
export type NewTranscriptionSegment = Database['public']['Tables']['transcription_segments']['Insert']
export type NewAnamnese = Database['public']['Tables']['anamneses']['Insert']

export interface CameraDevice {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

export interface TranscriptionState {
  isRecording: boolean
  transcriptionId: string | null
  currentText: string
  startedAt: Date | null
  audioChunks: Blob[]
}
