import React from "react"

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-stone-200 rounded-lg ${className}`} />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

export function ActivityRowSkeleton() {
  return (
    <div className="p-4 flex items-start gap-4">
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between items-start gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3 w-56" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-stone-100">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <Skeleton className="h-4 w-36" />
        </div>
      </td>
      <td className="px-4 py-3.5"><Skeleton className="h-4 w-24" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-4 w-20" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-4 w-20" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-4 w-32" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-4 w-24" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-4 w-20" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-6 w-28 rounded-full" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-6 w-28 rounded-full" /></td>
      <td className="px-4 py-3.5"><Skeleton className="h-4 w-20" /></td>
    </tr>
  )
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header card skeleton */}
      <div className="bg-red-800/60 rounded-xl p-8 animate-pulse">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-white/20" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-white/20 rounded-lg" />
            <div className="h-4 w-32 bg-white/10 rounded-lg" />
          </div>
        </div>
        <div className="h-8 w-48 bg-white/15 rounded-full mb-4" />
        <div className="flex gap-2">
          <div className="h-7 w-32 bg-white/10 rounded-full" />
          <div className="h-7 w-32 bg-white/10 rounded-full" />
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Main content skeleton */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 p-2 flex gap-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-9 w-36 rounded-lg" />)}
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="flex gap-4 py-3 border-b border-stone-100">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar skeleton */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
            <Skeleton className="h-4 w-24 mb-2" />
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  )
}
