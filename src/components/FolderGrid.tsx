'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Folder, Edit, Trash2 } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface FolderItem {
    id: string
    name: string
    created_at: string
    photo_count: number
}

interface FolderGridProps {
    folders: FolderItem[]
    onFolderClick: (folderId: string) => void
    onFolderDelete: (folderId: string) => void
    onFolderRename: (folderId: string, newName: string) => void
}

export default function FolderGrid({ folders, onFolderClick, onFolderDelete, onFolderRename }: FolderGridProps) {
    const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
    const [editingFolder, setEditingFolder] = useState<string | null>(null)
    const [editName, setEditName] = useState('')

    const startEdit = (folder: FolderItem) => {
        setEditingFolder(folder.id)
        setEditName(folder.name)
    }

    const saveEdit = () => {
        if (editingFolder && editName.trim()) {
            onFolderRename(editingFolder, editName.trim())
        }
        setEditingFolder(null)
        setEditName('')
    }

    const cancelEdit = () => {
        setEditingFolder(null)
        setEditName('')
    }

    if (folders.length === 0) {
        return (
            <div className="text-center py-8">
                <Folder className="w-12 h-12 text-primary mx-auto mb-3" />
                <p className="text-black text-sm">Nenhuma pasta criada ainda</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {folders.map((folder) => (
                <div
                    key={folder.id}
                    className="relative group"
                    onMouseEnter={() => setHoveredFolder(folder.id)}
                    onMouseLeave={() => setHoveredFolder(null)}
                >
                    <Card
                        className="p-3 cursor-pointer transition-all duration-200 hover:shadow-md bg-white border-primary/20 hover:border-primary/40"
                        onClick={() => onFolderClick(folder.id)}
                    >
                        <div className="flex flex-col items-center text-center space-y-2">
                            <Folder className="w-12 h-12 text-primary" />

                            {editingFolder === folder.id ? (
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit()
                                        if (e.key === 'Escape') cancelEdit()
                                    }}
                                    onBlur={saveEdit}
                                    className="w-full px-2 py-1 text-xs text-black bg-white border border-primary/30 rounded text-center"
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <div className="w-full">
                                    <p className="text-xs font-medium text-black truncate" title={folder.name}>
                                        {folder.name}
                                    </p>
                                    <p className="text-xs text-black/70 mt-1">
                                        {folder.photo_count} {folder.photo_count === 1 ? 'foto' : 'fotos'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Menu de ações */}
                        {hoveredFolder === folder.id && editingFolder !== folder.id && (
                            <div className="absolute top-2 right-2">
                                <div className="bg-white rounded-full shadow-lg p-1">
                                    <div className="flex space-x-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 hover:bg-primary/10"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                startEdit(folder)
                                            }}
                                        >
                                            <Edit className="w-3 h-3 text-primary" />
                                        </Button>

                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 w-6 p-0 hover:bg-destructive/10"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Trash2 className="w-3 h-3 text-destructive" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent className="bg-white">
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle className="text-black">Excluir Pasta</AlertDialogTitle>
                                                    <AlertDialogDescription className="text-black">
                                                        Tem certeza que deseja excluir a pasta &quot;{folder.name}&quot;?
                                                        Todas as fotos dentro dela serão movidas para a galeria principal.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="text-black">Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => onFolderDelete(folder.id)}
                                                        className="bg-destructive hover:bg-destructive/90 text-white"
                                                    >
                                                        Excluir
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            ))}
        </div>
    )
}
