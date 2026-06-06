import type { Metadata } from 'next'

import { LandingNav } from '@/components/landing/nav'
import { Hero } from '@/components/landing/hero'
import { FeaturesGrid } from '@/components/landing/features-grid'
import { HowItWorks } from '@/components/landing/how-it-works'
import { FeatureSpotlight } from '@/components/landing/feature-spotlight'
import { Testimonials } from '@/components/landing/testimonials'
import { FAQ } from '@/components/landing/faq'
import { CtaBanner } from '@/components/landing/cta-banner'
import { Footer } from '@/components/landing/footer'
import { InboxMock } from '@/components/landing/mock/inbox-mock'
import { PipelineMock } from '@/components/landing/mock/pipeline-mock'
import { AutomationMock } from '@/components/landing/mock/automation-mock'
import { AnalyticsMock } from '@/components/landing/mock/analytics-mock'
import { JsonLd } from '@/components/seo/json-ld'
import { landingPageLd } from '@/lib/seo/structured-data'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site-config'

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
}

export default function LandingPage() {
  return (
    <div className="bg-white text-gray-900">
      <JsonLd data={landingPageLd()} />
      <LandingNav />
      <main>
        <Hero />

        <FeaturesGrid />

        <FeatureSpotlight
          anchorId="inbox"
          eyebrow="Shared inbox"
          title="Never miss a WhatsApp conversation again"
          body="Your whole team works from one inbox. Assign conversations, reply together, and hand off threads without losing context. Real-time updates so two agents never reply to the same message."
          bullets={[
            'Assign conversations to specific agents or auto-distribute',
            'Internal notes only your team can see',
            'Unread badges so urgent replies never get buried',
            'One-click deep link into any conversation from the dashboard',
          ]}
          visual={<InboxMock />}
        />

        <HowItWorks />

        <FeatureSpotlight
          anchorId="automations"
          eyebrow="Smart automation"
          title="Automate follow-ups, focus on what matters"
          body="Build workflows that run automatically — welcome new contacts, reply to keywords, chase unread messages, and move deals forward. No code, no developers needed."
          bullets={[
            'Trigger on new messages, keywords, tags, schedules, and more',
            'Send messages, templates, add tags, create deals, fire webhooks',
            'Conditional branches for personalised flows',
            'Full run logs so you always know what happened and why',
          ]}
          reverse
          visual={<AutomationMock />}
        />

        <FeatureSpotlight
          anchorId="pipelines"
          eyebrow="Sales pipelines"
          title="Turn WhatsApp chats into closed deals"
          body="Drag deals through custom stages, link them to contacts, and see exactly where revenue is getting stuck. Every deal keeps its WhatsApp conversation one click away."
          bullets={[
            'Unlimited pipelines and custom stages',
            'Kanban drag-and-drop board',
            'Deal value totals per stage',
            'Linked contacts, conversations, and notes per deal',
          ]}
          visual={<PipelineMock />}
        />

        <FeatureSpotlight
          anchorId="analytics"
          eyebrow="Real-time analytics"
          title="See exactly what is working"
          body="Response times, daily volume, pipeline value, campaign performance, and an activity feed across every module. The dashboard surfaces what needs attention without you having to build a single chart."
          bullets={[
            'Live conversation counts, new contacts, and open deal value',
            'Message volume over 7, 30, or 90 days',
            'Average first-response time vs. your target',
            'Activity feed across messages, deals, broadcasts, automations',
          ]}
          reverse
          visual={<AnalyticsMock />}
        />

        <Testimonials />

        <FAQ />

        <CtaBanner />
      </main>
      <Footer />
    </div>
  )
}
