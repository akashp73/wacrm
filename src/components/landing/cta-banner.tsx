import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

const POINTS = ['No credit card required', 'Setup in 30 minutes', 'Cancel any time']

export function CtaBanner() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-16 text-center sm:px-16 sm:py-20"
          style={{
            background: 'linear-gradient(135deg, #16a34a 0%, #25D366 50%, #059669 100%)',
          }}
        >
          {/* Decorative circles */}
          <div
            aria-hidden
            className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-white/5"
          />
          <div
            aria-hidden
            className="absolute right-32 bottom-0 h-40 w-40 rounded-full bg-black/5"
          />

          {/* WhatsApp icon */}
          <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="h-9 w-9">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>

          <h2 className="relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to grow with WhatsApp?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base text-green-50 sm:text-lg">
            Join 10,000+ businesses using WACRM to send campaigns, automate
            replies, and close more deals — all from one inbox.
          </p>

          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-green-700 shadow-lg transition-all hover:bg-green-50 hover:shadow-xl active:scale-95"
            >
              Start for Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-white/40 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 hover:border-white/60"
            >
              Already have an account? Login →
            </Link>
          </div>

          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-6">
            {POINTS.map((p) => (
              <span key={p} className="flex items-center gap-2 text-sm text-green-50">
                <CheckCircle2 className="h-4 w-4 text-white" />
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
