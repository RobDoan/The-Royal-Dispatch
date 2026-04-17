import { BottomNav } from '@/components/BottomNav';
import { Header } from '@/components/Header';

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function PlayLayout({ children, params }: Props) {
  const { locale } = await params;
  return (
    <div className="pb-32 pt-20">
      <Header />
      {children}
      <BottomNav locale={locale} />
    </div>
  );
}
