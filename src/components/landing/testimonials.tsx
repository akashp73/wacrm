import { Star, Quote } from 'lucide-react'
import { Section, SectionHeader } from './section'

interface Testimonial {
  name: string
  role: string
  company: string
  avatarUrl: string
  rating: number
  text: string
  industry: string
  metric: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Rahul Sharma',
    role: 'Founder & CEO',
    company: 'QuickMart India',
    avatarUrl: 'https://i.pravatar.cc/80?img=12',
    rating: 5,
    industry: 'E-Commerce',
    metric: '3x more conversions',
    text: 'We went from missing 40% of customer messages to responding to every single one within minutes. Sensytick completely changed how we handle customer queries on WhatsApp. Our sales conversions tripled in just two months.',
  },
  {
    name: 'Priya Mehta',
    role: 'Head of Sales',
    company: 'EduTech Pro',
    avatarUrl: 'https://i.pravatar.cc/80?img=5',
    rating: 5,
    industry: 'Education',
    metric: '800 leads in 24 hours',
    text: 'We sent admission reminders to 5,000 parents and got 800 inquiries back in 24 hours. The chatbot handles all FAQs automatically — our team just focuses on closing. I cannot imagine running our admissions without it now.',
  },
  {
    name: 'Arjun Patel',
    role: 'Managing Director',
    company: 'Patel Properties',
    avatarUrl: 'https://i.pravatar.cc/80?img=15',
    rating: 5,
    industry: 'Real Estate',
    metric: '12 agents, one inbox',
    text: 'We tried three other WhatsApp CRM tools before Sensytick. Nothing came close. The pipeline view — seeing every deal linked to its WhatsApp thread — is a game changer. Our 12 agents work from one shared inbox with zero confusion.',
  },
  {
    name: 'Sneha Nair',
    role: 'Marketing Manager',
    company: 'StyleHub Fashion',
    avatarUrl: 'https://i.pravatar.cc/80?img=9',
    rating: 5,
    industry: 'Fashion Retail',
    metric: '₹2L+ extra revenue/month',
    text: 'Our abandoned cart recovery automation generates over ₹2 lakh in extra revenue every single month. We run weekly broadcast campaigns to 15,000+ customers and the delivery analytics are incredible.',
  },
  {
    name: 'Vikram Reddy',
    role: 'Operations Head',
    company: 'RedFin Logistics',
    avatarUrl: 'https://i.pravatar.cc/80?img=17',
    rating: 5,
    industry: 'Logistics',
    metric: '47 min → 4 min response',
    text: 'Customer service was chaos before Sensytick — 8 agents across 3 phones. Now everything is in one inbox, conversations get auto-assigned, and our average response time dropped from 47 minutes to under 4 minutes.',
  },
  {
    name: 'Anjali Gupta',
    role: 'Director',
    company: 'HealthFirst Clinics',
    avatarUrl: 'https://i.pravatar.cc/80?img=44',
    rating: 5,
    industry: 'Healthcare',
    metric: '60% fewer no-shows',
    text: 'Appointment reminders via WhatsApp reduced no-shows by 60%. The chatbot handles booking and rescheduling 24/7 without any staff involvement. Our reception team now focuses entirely on patients in-clinic.',
  },
]

const SUMMARY = [
  { value: '4.9 / 5', label: 'Average rating' },
  { value: '2,400+', label: 'Verified reviews' },
  { value: '96%', label: 'Would recommend' },
  { value: '10,000+', label: 'Active businesses' },
]

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  )
}

const INDUSTRY_COLORS: Record<string, string> = {
  'E-Commerce':    'bg-blue-50 text-blue-700',
  'Education':     'bg-violet-50 text-violet-700',
  'Real Estate':   'bg-amber-50 text-amber-700',
  'Fashion Retail':'bg-pink-50 text-pink-700',
  'Logistics':     'bg-cyan-50 text-cyan-700',
  'Healthcare':    'bg-green-50 text-green-700',
}

export function Testimonials() {
  return (
    <Section id="testimonials" tinted>
      <SectionHeader
        eyebrow="Customer stories"
        title="Real businesses, real results"
        description="Thousands of companies across India use Sensytick every day to manage conversations, run campaigns, and grow faster on WhatsApp."
      />

      {/* Summary bar */}
      <div className="mb-12 grid grid-cols-2 gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:grid-cols-4">
        {SUMMARY.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-3xl font-extrabold text-gray-900">{s.value}</p>
            <p className="mt-1 text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <div
            key={t.name}
            className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
          >
            {/* Header row */}
            <div className="flex items-start justify-between mb-4">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${INDUSTRY_COLORS[t.industry] ?? 'bg-gray-100 text-gray-600'}`}>
                {t.industry}
              </span>
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-bold text-green-700">
                {t.metric}
              </span>
            </div>

            {/* Stars */}
            <Stars rating={t.rating} />

            {/* Quote */}
            <div className="relative mt-4 flex-1">
              <Quote className="absolute -left-1 -top-1 h-5 w-5 text-gray-100" />
              <p className="pl-4 text-sm leading-relaxed text-gray-600">{t.text}</p>
            </div>

            {/* Author */}
            <div className="mt-6 flex items-center gap-3 border-t border-gray-50 pt-5">
              <img
                src={t.avatarUrl}
                alt={t.name}
                className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500">{t.role}, {t.company}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
