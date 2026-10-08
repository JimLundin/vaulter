// One settings tree: rows stack in compact space and form two columns when expanded.
import type { ReactNode } from 'react';
import { useIsMobile } from './hooks/use-mobile.ts';
import { Label } from './parts/label.tsx';
import { PageHeader } from './app.tsx';

export function SettingsPage({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <article
      data-layout={mobile ? 'mobile-settings' : 'desktop-settings'}
      className="flex min-h-full flex-col bg-surface md:max-w-4xl md:gap-8 md:bg-background md:px-[var(--page-inset)] md:py-[var(--page-block)]"
    >
      <PageHeader title="Settings" description="Preferences for this device" />
      <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-0">{children}</div>
    </article>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 md:gap-5 md:border-t md:pt-6">
      <h2 className="m-0 px-[var(--page-inset)] text-label font-semibold text-muted-foreground md:px-0 md:text-copy md:text-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-5 border-y bg-background px-[var(--page-inset)] py-4 md:border-0 md:p-0">
        {children}
      </div>
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
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] md:items-start md:gap-x-8 md:gap-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1">{children}</div>
      <p
        id={descriptionId}
        className="m-0 text-label leading-relaxed text-muted-foreground md:col-start-1"
      >
        {description}
      </p>
    </div>
  );
}
