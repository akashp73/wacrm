import Link from 'next/link'
import { ArrowRight, CheckCircle2, Star, TrendingUp, MessageCircle, Users } from 'lucide-react'
import { InboxMock } from './mock/inbox-mock'

const TRUST_POINTS = [
  'No credit card required',
  'Setup in under 30 minutes',
  'Official WhatsApp® Business API',
]

const STATS = [
  { icon: Users, value: '10,000+', label: 'Businesses' },
  { icon: MessageCircle, value: '500M+', label: 'Messages sent' },
  { icon: TrendingUp, value: '3x', label: 'More conversions' },
  { icon: Star, value: '4.9 / 5', label: 'Customer rating' },
]

export function Hero() {
  return (
    <>
      {/* Hero section */}
      <div className="relative overflow-hidden bg-white">
        {/* Subtle green tint top-right */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] -z-0 opacity-30"
          style={{
            background: 'radial-gradient(circle at top right, #dcfce7, transparent 65%)',
          }}
        />

        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:gap-20">
          {/* Left — copy */}
          <div className="relative">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-1.5 text-xs font-semibold text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Powered by Official WhatsApp® Business API
            </div>

            {/* Headline */}
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Grow your business{' '}
              <span className="relative whitespace-nowrap">
                <span
                  className="relative bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(135deg, #16a34a 0%, #25D366 60%)' }}
                >
                  with WhatsApp
                </span>
              </span>
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-relaxed text-gray-500">
              Send bulk campaigns, automate replies, manage your team inbox,
              and close more deals — all in one place. The WhatsApp CRM built
              for growing businesses.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:opacity-95 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #25D366 0%, #16a34a 100%)' }}
              >
                Start for Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                Already have an account? Login →
              </Link>
            </div>

            {/* Trust points */}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {TRUST_POINTS.map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-sm text-gray-500">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  {t}
                </span>
              ))}
            </div>

            {/* Social proof avatars */}
            <div className="mt-8 flex items-center gap-4 border-t border-gray-100 pt-6">
              <div className="flex -space-x-2.5">
                {[10, 20, 30, 40, 50].map((n) => (
                  <img
                    key={n}
                    src={`https://i.pravatar.cc/40?img=${n}`}
                    alt=""
                    className="h-9 w-9 rounded-full border-2 border-white object-cover shadow-sm"
                  />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map((n) => (
                    <Star key={n} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mt-0.5 text-sm text-gray-500">
                  Loved by <span className="font-semibold text-gray-800">10,000+ businesses</span>
                </p>
              </div>
            </div>
          </div>

          {/* Right — visual */}
          <div className="relative lg:justify-self-end">
            <div
              className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl"
              style={{ background: 'linear-gradient(135deg, #25D366, #16a34a)' }}
              aria-hidden
            />
            <div className="relative rounded-2xl shadow-2xl ring-1 ring-gray-200/50">
              <InboxMock />
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="border-y border-gray-100 bg-gray-50">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-0 px-6 sm:grid-cols-4 divide-x divide-gray-200">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex flex-col items-center py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 mb-3">
                <Icon className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl font-extrabold text-gray-900 sm:text-3xl">{value}</p>
              <p className="mt-1 text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
