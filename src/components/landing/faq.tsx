"use client"

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Section, SectionHeader } from './section'
import { FAQ_ITEMS } from '@/lib/seo/faq-data'
import { cn } from '@/lib/utils'

export function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <Section id="faq">
      <SectionHeader
        eyebrow="FAQ"
        title="Questions we get asked a lot"
        description="Can't find the answer you're looking for? Reach out to our support team and we'll get back to you within a few hours."
      />

      <div className="mx-auto max-w-3xl divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIdx === i
          return (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-gray-50"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-gray-900">{item.q}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200',
                    isOpen && 'rotate-180 text-green-500',
                  )}
                />
              </button>
              {isOpen && (
                <div className="px-6 pb-5 text-sm leading-relaxed text-gray-500 border-t border-gray-50 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
