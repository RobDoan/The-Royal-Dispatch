import { BottomNav } from '@/components/BottomNav';

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function TabsLayout({ children, params }: Props) {
  const { locale } = await params;
  return (
    <div className="pb-16">
      {children}
      <BottomNav locale={locale} />
    </div>
  );
}
