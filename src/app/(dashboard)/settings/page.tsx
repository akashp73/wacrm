'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, Tag, User, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TagManager } from '@/components/settings/tag-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { TeamManager } from '@/components/settings/team-manager';
import { useAuth } from '@/hooks/use-auth';
import { useRoleGuard } from '@/hooks/use-role-guard';

const TAB_VALUES = ['profile', 'whatsapp', 'tags', 'team'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { memberRole } = useAuth();
  useRoleGuard('admin');

  const queryTab = searchParams.get('tab');
  const tab: TabValue = isTabValue(queryTab) ? queryTab : 'profile';

  const onChange = (next: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold text-foreground">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Manage your profile, WhatsApp® integration, and tags.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="profile" className="data-active:bg-muted data-active:text-foreground text-muted-foreground">
            <User className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="data-active:bg-muted data-active:text-foreground text-muted-foreground">
            <Settings className="size-4" />
            WhatsApp Config
          </TabsTrigger>
          <TabsTrigger value="tags" className="data-active:bg-muted data-active:text-foreground text-muted-foreground">
            <Tag className="size-4" />
            Tags
          </TabsTrigger>
          {(memberRole === 'owner' || memberRole === 'admin') && (
            <TabsTrigger value="team" className="data-active:bg-muted data-active:text-foreground text-muted-foreground">
              <Users className="size-4" />
              Team
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>

        <TabsContent value="team">
          <TeamManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
