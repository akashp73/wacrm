import { PremiumGate } from '@/components/ui/premium-gate'

export default function BotStudioLayout({ children }: { children: React.ReactNode }) {
  return <PremiumGate feature="Bot Studio">{children}</PremiumGate>
}
