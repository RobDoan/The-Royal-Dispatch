import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ParticlesBackground } from '@/components/ParticlesBackground';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'en' | 'vi')) notFound();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="bg-[#FFFDF5] bg-[radial-gradient(circle_at_center,theme(colors.white/0.5)_0%,theme(colors.orange.100/0.1)_100%)] min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <ParticlesBackground />
          <div className="relative z-10">
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
