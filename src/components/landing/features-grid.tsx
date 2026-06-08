import {
  MessageSquare,
  Users,
  GitBranch,
  Radio,
  Zap,
  LineChart,
  Bot,
  Repeat,
  ShieldCheck,
  Headphones,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { Section, SectionHeader } from './section'

interface Feature {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  badge?: string
}

const FEATURES: Feature[] = [
  {
    title: 'Shared Team Inbox',
    description: 'All your WhatsApp conversations in one place. Assign threads, reply as a team, and never miss a customer message.',
    icon: MessageSquare,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    title: 'Bulk Broadcast Campaigns',
    description: 'Send WhatsApp campaigns to thousands of contacts instantly with Meta-approved templates. Track opens, clicks, and replies.',
    icon: Radio,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    badge: 'Popular',
  },
  {
    title: 'Chatbot Builder',
    description: 'Create keyword-triggered chatbots that auto-reply 24/7, collect lead information, and handle FAQs without a single developer.',
    icon: Bot,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    badge: 'New',
  },
  {
    title: 'No-Code Automations',
    description: 'Welcome new contacts, follow up on missed replies, route leads by keyword. A visual builder anyone on your team can use.',
    icon: Zap,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
  },
  {
    title: 'Contact Management',
    description: 'Tags, custom fields, notes, and smart deduplication. Import contacts from CSV and segment them for targeted outreach.',
    icon: Users,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
  {
    title: 'Sales Pipelines',
    description: 'Drag deals through stages. Every deal stays linked to its WhatsApp thread — no context lost when deals change hands.',
    icon: GitBranch,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
  },
  {
    title: 'Drip Campaigns',
    description: 'Schedule a sequence of WhatsApp messages over days or weeks. Nurture leads and onboard customers on autopilot.',
    icon: Repeat,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
  },
  {
    title: 'Real-time Analytics',
    description: 'Response times, message volume, pipeline value, and campaign performance — all surfaced on one clean dashboard.',
    icon: LineChart,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
  },
  {
    title: 'Bank-grade Security',
    description: 'AES-256 encrypted token storage, HMAC signature verification on every webhook, and row-level database security.',
    icon: ShieldCheck,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  {
    title: 'Dedicated Support',
    description: 'Onboarding help, live chat support, and a growing knowledge base. We are here to help you get results fast.',
    icon: Headphones,
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-600',
  },
]

export function FeaturesGrid() {
  return (
    <Section id="features" tinted>
      <SectionHeader
        eyebrow="Everything you need"
        title="One platform for your entire WhatsApp business"
        description="Stop stitching together a broadcast tool, an inbox, and a spreadsheet. Sensytick gives you everything — and it all works together out of the box."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {FEATURES.map((f, i) => {
          const Icon = f.icon
          const wide = i < 2
          return (
            <div
              key={f.title}
              className={`group relative rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                wide ? 'xl:col-span-2' : 'xl:col-span-1'
              }`}
            >
              {f.badge && (
                <span
                  className={`absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    f.badge === 'New'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {f.badge}
                </span>
              )}
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.iconBg}`}>
                <Icon className={`h-5 w-5 ${f.iconColor}`} />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{f.description}</p>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
