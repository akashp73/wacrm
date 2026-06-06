import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Section } from './section'
import { cn } from '@/lib/utils'

interface FeatureSpotlightProps {
  eyebrow: string
  title: string
  body: string
  bullets?: string[]
  reverse?: boolean
  visual: ReactNode
  anchorId?: string
  tinted?: boolean
}

export function FeatureSpotlight({
  eyebrow,
  title,
  body,
  bullets,
  reverse,
  visual,
  anchorId,
  tinted,
}: FeatureSpotlightProps) {
  return (
    <Section id={anchorId} className="py-16 sm:py-20" tinted={tinted}>
      <div
        className={cn(
          'grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20',
          reverse && 'lg:[&>*:first-child]:order-2',
        )}
      >
        <div>
          <span className="inline-block rounded-full bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-green-600 mb-4">
            {eyebrow}
          </span>
          <h3 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {title}
          </h3>
          <p className="mt-4 text-base leading-relaxed text-gray-500">{body}</p>
          {bullets && bullets.length > 0 && (
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-gray-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl shadow-xl ring-1 ring-gray-100 overflow-hidden">
          {visual}
        </div>
      </div>
    </Section>
  )
}
