import { PremiumGate } from '@/components/ui/premium-gate'

export default function AIAgentLayout({ children }: { children: React.ReactNode }) {
  return <PremiumGate feature="AI Agent">{children}</PremiumGate>
}
