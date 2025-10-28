import { Skeleton } from '@/components/ui/skeleton'

interface PhotoGridSkeletonProps {
  count?: number
}

export default function PhotoGridSkeleton({ count = 15 }: PhotoGridSkeletonProps) {
  return (
    <div className="grid grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}
