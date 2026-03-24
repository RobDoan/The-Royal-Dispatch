'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Props {
  princess: { id: string; name: string; emoji: string; origin?: string };
  audioUrl: string;
}

export function AudioPlayer({ princess, audioUrl }: Props) {
  const t = useTranslations('app');
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Toddler Lock state
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    audio.onended = () => setPlaying(false);
    
    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 100); 
    };
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.onended = null;
    };
  }, [audioUrl]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  }

  // Toddler Lock Handlers
  const startHold = useCallback(() => {
    let tick = 0;
    const interval = 50; // ms
    const maxTicks = 1000 / interval; // 1 second to hold

    holdTimerRef.current = setInterval(() => {
      tick++;
      setHoldProgress((tick / maxTicks) * 100);
      if (tick >= maxTicks) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        router.back();
      }
    }, interval);
  }, [router]);

  const endHold = useCallback(() => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    setHoldProgress(0);
  }, []);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black font-sans overflow-hidden">
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Fixed Background Image */}
      <div className="absolute top-0 left-0 right-0 h-[60vh]">
        <img 
          src={`/characters/${princess.id}.png`} 
          alt={princess.name}
          className="w-full h-full object-cover object-center"
        />
        {/* Top gradient for back button visibility against bright images */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-transparent h-40 pointer-events-none" />
      </div>

      {/* Top Header Navigation */}
      <div className="absolute top-0 left-0 right-0 p-6 pt-safe flex items-center justify-between z-50">
        <button 
          onClick={() => router.back()}
          className="w-12 h-12 flex items-center justify-center text-white drop-shadow-lg"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button className="w-12 h-12 flex items-center justify-center text-white drop-shadow-lg">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
        </button>
      </div>

      {/* Wrapper for Bottom Sheet positioning */}
      <div className="absolute inset-x-0 bottom-0 top-[40vh] z-10 pointer-events-none flex flex-col">
        
        {/* Floating Play Button (must be outside overflow-hidden) */}
        <div className="absolute -top-10 left-8 z-30 pointer-events-auto">
           <button
             onClick={toggle}
             className="w-20 h-20 bg-white rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.15)] flex items-center justify-center text-[var(--color-primary-orange)] transition-transform active:scale-95"
           >
             {playing ? (
               <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
             ) : (
               <svg className="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
             )}
           </button>
        </div>

        {/* The Scrollable Main Sheet */}
        <div className="absolute inset-0 bg-[var(--background)] rounded-t-[40px] shadow-[0_-15px_50px_rgba(0,0,0,0.4)] overflow-hidden pointer-events-auto flex flex-col pt-16">
          
          {/* Scrollable Transcript Area */}
          <div className="flex-1 overflow-y-auto px-8 pb-32 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
             
             {/* Title & Metadata */}
             <div className="mb-8">
               <h1 className="text-[40px] leading-tight font-black tracking-tight mb-2 text-gray-900" style={{ fontFamily: '"Quicksand", sans-serif' }}>
                 {princess.name}
               </h1>
               <p className="text-gray-400 font-bold mb-1 uppercase tracking-wider text-[11px]">{princess.origin || 'Fairy Tale'} • Bedtime Story</p>
               <p className="text-gray-500 font-semibold mb-8 text-sm">Runtime: 7 mins</p>
             </div>

             {/* Mock Transcript Text */}
             <div className="text-[17px] text-gray-700 leading-relaxed space-y-7 font-medium pb-8 w-full max-w-prose">
               <p>Welcome to the enchanting world of {princess.name}. This is a beautifully crafted story that takes you on a magnificent journey.</p>
               <p>As the sun sets over the kingdom, our hero discovers a hidden path that leads to a secret garden. The flowers there glow with a soft, magical light, and the gentle breeze carries the sweet scent of adventure.</p>
               <p>With every step, the magic grows stronger. Friends are made, challenges are overcome, and the true meaning of courage and kindness is revealed. The journey is not just about reaching the destination, but about the beautiful moments shared along the way.</p>
             </div>
          </div>

          {/* Sticky Player Footer */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-[var(--background)] border-t border-gray-100 flex flex-col items-center justify-center px-8 z-20 pb-safe">
            
            {/* Minimal Progress Bar */}
            <div className="w-full flex items-center justify-between mt-2 mb-4">
              <span className="text-[11px] font-bold text-gray-400 w-10 text-left">
                0:{Math.floor(progress).toString().padStart(2, '0')}
              </span>
              <div className="flex-1 max-w-[200px] h-1.5 bg-gray-200 rounded-full mx-4">
                <div 
                  className="h-full bg-[var(--color-primary-orange)] rounded-full relative"
                  style={{ width: `${progressPercent}%` }}
                >
                   <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 bg-white border-[3px] border-[var(--color-primary-orange)] rounded-full shadow-sm" />
                </div>
              </div>
              <span className="text-[11px] font-bold text-gray-400 w-10 text-right">
                {duration ? `0:${Math.floor(duration).toString().padStart(2, '0')}` : '7:00'}
              </span>
            </div>

            {/* Hold to Exit (Buy Ticket replacement) & Audio Nav */}
            <div className="w-full flex justify-between items-center px-2">
               <button 
                 className="text-gray-400 hover:text-gray-600 font-bold text-xl active:scale-95 transition-transform" 
                 onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 10 }}
                 aria-label="Rewind 10s"
               >
                 ↺
               </button>
               
               {/* Toddler Lock Button */}
               <button
                 onPointerDown={startHold}
                 onPointerUp={endHold}
                 onPointerLeave={endHold}
                 className="relative overflow-hidden w-48 h-[52px] bg-black text-white font-extrabold text-[13px] tracking-widest rounded-full uppercase flex items-center justify-center select-none touch-none active:scale-[0.98] transition-transform shadow-lg"
               >
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-[var(--color-primary-orange)] opacity-40 transition-all ease-linear"
                    style={{ width: `${holdProgress}%` }}
                  />
                  <span className="relative z-10">Hold to Exit 🔒</span>
               </button>

               <button 
                 className="text-gray-400 hover:text-gray-600 font-bold text-xl active:scale-95 transition-transform" 
                 onClick={() => { if(audioRef.current) audioRef.current.currentTime += 10 }}
                 aria-label="Skip 10s"
               >
                 ↻
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
