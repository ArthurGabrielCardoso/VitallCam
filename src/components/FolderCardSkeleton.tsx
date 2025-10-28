import { Skeleton } from '@/components/ui/skeleton'
import { Folder } from 'lucide-react'

export default function FolderCardSkeleton() {
  return (
    <div className="aspect-square bg-orange-50 rounded-lg flex flex-col items-center justify-center">
      <Folder className="w-12 h-12 text-gray-300 mb-2 animate-pulse" />
      <Skeleton className="h-4 w-24" />
    </div>
  )
}
