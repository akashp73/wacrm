import { Plug, Users, Zap } from 'lucide-react'
import { Section, SectionHeader } from './section'

const STEPS = [
  {
    num: '01',
    icon: Plug,
    title: 'Connect your WhatsApp number',
    body: 'Paste your phone number ID and access token from Meta. Works with any Meta-approved WhatsApp Business API provider. Takes under 5 minutes.',
    color: 'bg-green-50 text-green-600',
    border: 'border-green-100',
  },
  {
    num: '02',
    icon: Users,
    title: 'Import your contacts',
    body: 'Upload a CSV or let incoming WhatsApp messages build your contact list automatically. Add tags, custom fields, and notes from day one.',
    color: 'bg-blue-50 text-blue-600',
    border: 'border-blue-100',
  },
  {
    num: '03',
    icon: Zap,
    title: 'Reply, automate, and grow',
    body: 'Use the shared inbox with your team, set up automations for repeat tasks, send broadcast campaigns, and watch your analytics improve week over week.',
    color: 'bg-violet-50 text-violet-600',
    border: 'border-violet-100',
  },
]

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeader
        eyebrow="How it works"
        title="Live in under 30 minutes"
        description="Most teams are up and running before their first coffee break. No developers, no onboarding calls, no complexity."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={s.num}
              className={`relative rounded-2xl border ${s.border} bg-white p-7 shadow-sm`}
            >
              {/* Connector line between steps */}
              {i < STEPS.length - 1 && (
                <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-gray-200 md:block" />
              )}
              <div className="flex items-start justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-5xl font-black text-gray-100 tabular-nums leading-none" aria-hidden>
                  {s.num}
                </span>
              </div>
              <h3 className="mt-5 text-base font-bold text-gray-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{s.body}</p>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
