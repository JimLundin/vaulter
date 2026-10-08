// Settings share preference state; phone controls and desktop form rows are different compositions.
import type { ReactNode } from 'react';
import { useIsMobile } from './hooks/use-mobile.ts';
import { Label } from './parts/label.tsx';
import { PageHeader } from './app.tsx';

export function SettingsPage({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  return mobile ? (
    <article data-layout="mobile-settings" className="flex min-h-full flex-col bg-surface">
      <PageHeader title="Settings" description="Preferences for this device" />
      <div className="flex flex-col gap-6 py-6">{children}</div>
    </article>
  ) : (
    <article data-layout="desktop-settings" className="flex max-w-4xl flex-col gap-8 px-12 py-9">
      <PageHeader title="Settings" description="Preferences for this device" />
      <div className="flex flex-col gap-8">{children}</div>
    </article>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const mobile = useIsMobile();
  return mobile ? (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="m-0 px-4 text-xs font-semibold text-muted-foreground">{title}</h2>
      <div className="border-y bg-background px-4 py-4">{children}</div>
    </section>
  ) : (
    <section aria-label={title} className="flex flex-col gap-5 border-t pt-6">
      <h2 className="m-0 text-copy font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingField({
  label,
  htmlFor,
  description,
  descriptionId,
  children,
}: {
  label: string;
  htmlFor?: string;
  description: string;
  descriptionId?: string;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  return mobile ? (
    <div className="flex flex-col gap-3 [&_input]:h-12 [&_input]:text-base">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      <p id={descriptionId} className="m-0 text-label leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  ) : (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(240px,320px)] items-start gap-8">
      <div className="flex flex-col gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        <p id={descriptionId} className="m-0 text-label leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
