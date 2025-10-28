'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'

interface EditFolderModalProps {
  isOpen: boolean
  onClose: () => void
  onEditFolder: (name: string) => void
  currentName: string
  isLoading?: boolean
}

export default function EditFolderModal({
  isOpen,
  onClose,
  onEditFolder,
  currentName,
  isLoading = false
}: EditFolderModalProps) {
  const [name, setName] = useState(currentName)

  // Reset name when modal opens with new current name
  useEffect(() => {
    if (isOpen) {
      setName(currentName)
    }
  }, [isOpen, currentName])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && name.trim() !== currentName) {
      onEditFolder(name.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onKeyDown={handleKeyDown}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-black">Editar Nome da Pasta</h3>
          <Button
            onClick={onClose}
            className="bg-gray-500 hover:bg-gray-600 text-white w-8 h-8 p-0 rounded-full"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="folder-name" className="block text-sm font-medium text-black mb-2">
              Nome da Pasta
            </label>
            <Input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Digite o nome da pasta"
              className="w-full"
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary hover:bg-primary/90 text-white"
              disabled={!name.trim() || name.trim() === currentName || isLoading}
            >
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}