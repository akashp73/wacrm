'use client';

import { TemplateManager } from '@/components/settings/template-manager';

export default function TemplatesPage() {
  return (
    <div className="space-y-1">
      <h1 className="text-[26px] font-semibold text-foreground">Templates</h1>
      <p className="text-[13px] text-muted-foreground">
        Reusable, Meta-approved message formats for broadcasts and automated replies.
      </p>
      <TemplateManager />
    </div>
  );
}
