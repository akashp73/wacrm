import { PremiumGate } from '@/components/ui/premium-gate'

export default function DripLayout({ children }: { children: React.ReactNode }) {
  return <PremiumGate feature="Drip Campaigns">{children}</PremiumGate>
}
