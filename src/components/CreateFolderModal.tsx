'use client'

import { useState } from 'react'
import { FolderPlus, X, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface CreateFolderModalProps {
    isOpen: boolean
    onClose: () => void
    onCreateFolder: (name: string) => Promise<void>
}

export default function CreateFolderModal({ isOpen, onClose, onCreateFolder }: CreateFolderModalProps) {
    const [folderName, setFolderName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const { toast } = useToast()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!folderName.trim()) {
            toast({
                variant: "destructive",
                title: "Nome obrigatório",
                description: "Por favor, digite um nome para a pasta"
            })
            return
        }

        setIsCreating(true)
        try {
            await onCreateFolder(folderName.trim())
            setFolderName('')
            onClose()
            toast({
                title: "Pasta criada",
                description: `Pasta "${folderName.trim()}" criada com sucesso`
            })
        } catch {
            toast({
                variant: "destructive",
                title: "Erro",
                description: "Falha ao criar pasta"
            })
        } finally {
            setIsCreating(false)
        }
    }

    const handleClose = () => {
        if (!isCreating) {
            setFolderName('')
            onClose()
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <FolderPlus className="w-5 h-5 text-primary" />
                        <h2 className="text-xl font-bold text-black">Nova Pasta</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isCreating}
                        className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                        type="button"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            placeholder="Nome da pasta"
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            disabled={isCreating}
                            className="w-full px-4 py-3 border border-primary/30 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors text-black"
                            autoFocus
                            maxLength={50}
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isCreating}
                            className="px-4 py-2 text-black border border-primary/30 rounded-lg hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            disabled={isCreating || !folderName.trim()}
                            className="px-6 py-2 text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 bg-secondary hover:bg-secondary/90"
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Criando...
                                </>
                            ) : (
                                <>
                                    <FolderPlus className="w-4 h-4" />
                                    Criar Pasta
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
