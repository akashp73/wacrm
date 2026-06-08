import Link from 'next/link'
import Image from 'next/image'

const PRODUCT_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#testimonials', label: 'Testimonials' },
  { href: '#faq', label: 'FAQ' },
]

const ACCOUNT_LINKS = [
  { href: '/signup', label: 'Create account' },
  { href: '/login', label: 'Login' },
  { href: '/forgot-password', label: 'Forgot password' },
]

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy policy' },
  { href: '/terms', label: 'Terms of service' },
  { href: '/contact', label: 'Contact us' },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto w-full max-w-7xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/logo-mark.png" alt="" width={40} height={40} className="h-10 w-10" />
              <span className="text-lg font-bold text-gray-900">Sensytick</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
              The complete WhatsApp CRM — shared inbox, broadcasts, chatbots,
              automations, and sales pipelines in one platform.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #25D366 0%, #16a34a 100%)' }}
              >
                Start for Free
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                Login
              </Link>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Product</h4>
            <ul className="mt-4 space-y-3">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Account</h4>
            <ul className="mt-4 space-y-3">
              {ACCOUNT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Legal</h4>
            <ul className="mt-4 space-y-3">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-100">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-2 px-6 py-5 text-xs text-gray-400 sm:flex-row sm:items-center">
          <span>© {year} Sensytick. All rights reserved.</span>
          <span>WhatsApp® is a registered trademark of Meta Platforms, Inc. Sensytick is not affiliated with Meta.</span>
        </div>
      </div>
    </footer>
  )
}
