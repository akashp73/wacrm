'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { TemplateBuilder } from '@/components/settings/template-builder';
import type { MessageTemplate } from '@/types';

export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('message_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setNotFound(true);
        else setTemplate(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground text-sm">Template not found.</p>
      </div>
    );
  }

  return <TemplateBuilder initialTemplate={template!} />;
}
