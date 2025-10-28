import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header Loading */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
          <div>
            <div className="w-40 h-5 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="w-28 h-4 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="w-20 h-10 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Toolbar Loading */}
      <div className="flex items-center gap-4 p-6">
        <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse" />
        <div className="w-24 h-8 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Content Loading */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="w-32 h-6 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>

      {/* Loading Indicator Central */}
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
        <Card className="bg-white shadow-lg">
          <CardContent className="flex items-center justify-center py-8 px-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mr-3" />
            <span className="text-black font-medium">Carregando paciente...</span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}