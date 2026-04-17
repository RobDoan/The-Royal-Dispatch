'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CallScreen } from '@/components/CallScreen';
import type { Princess } from '@/lib/api';
import { getStoredChildId } from '@/lib/user';

export default function ActiveCallPage() {
  const { locale, princess } = useParams<{ locale: string; princess: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const childId = searchParams.get('child_id') || getStoredChildId();

  if (!childId) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <p className="text-white/60 text-center">
          Please select a child first before calling a princess.
        </p>
      </div>
    );
  }

  const handleCallEnd = () => {
    router.push(`/${locale}/call`);
  };

  return (
    <CallScreen
      princess={princess as Princess}
      childId={childId}
      onCallEnd={handleCallEnd}
    />
  );
}
