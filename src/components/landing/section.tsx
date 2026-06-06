import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function Section({
  id,
  className,
  children,
  tight,
  tinted,
}: {
  id?: string
  className?: string
  children: ReactNode
  tight?: boolean
  tinted?: boolean
}) {
  return (
    <section
      id={id}
      className={cn(tinted && 'bg-gray-50', className)}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-7xl px-6',
          tight ? 'py-6' : 'py-20 sm:py-24',
        )}
      >
        {children}
      </div>
    </section>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow?: string
  title: string
  description?: string
  align?: 'center' | 'left'
}) {
  return (
    <div
      className={cn(
        align === 'center' ? 'text-center mx-auto max-w-2xl' : 'text-left max-w-2xl',
        'mb-14',
      )}
    >
      {eyebrow && (
        <span className="inline-block rounded-full bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-green-600 mb-4">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-gray-500">{description}</p>
      )}
    </div>
  )
}
