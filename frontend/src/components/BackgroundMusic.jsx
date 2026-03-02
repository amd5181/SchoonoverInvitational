import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const VIDEO_ID = 'G97AdMLbfr4';

export default function BackgroundMusic() {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initPlayer = () => {
      if (!containerRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: VIDEO_ID,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          loop: 1,
          playlist: VIDEO_ID, // required for loop to work
          playsinline: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: e => {
            e.target.playVideo();
            setReady(true);
          },
          onStateChange: e => {
            // Backup loop: restart if video ends
            if (e.data === window.YT.PlayerState.ENDED) e.target.playVideo();
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        initPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, []);

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) {
      p.unMute();
      p.setVolume(60);
    } else {
      p.mute();
    }
    setMuted(m => !m);
  };

  if (!ready) return null;

  return (
    <button
      onClick={toggle}
      title={muted ? 'Click to play background music' : 'Mute background music'}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-semibold backdrop-blur-sm border transition-all shadow-lg ${
        muted
          ? 'bg-black/50 border-white/15 text-white/60 hover:bg-black/70 hover:text-white/90'
          : 'bg-[#1B4332]/80 border-[#CCFF00]/30 text-white hover:bg-[#1B4332] hover:border-[#CCFF00]/60'
      }`}
    >
      {muted
        ? <VolumeX className="w-3.5 h-3.5 flex-shrink-0" />
        : <Volume2 className="w-3.5 h-3.5 flex-shrink-0 text-[#CCFF00]" />
      }
      <span>{muted ? 'Music' : 'Music'}</span>
      {!muted && (
        <span className="flex gap-px items-end h-3">
          <span className="w-0.5 bg-[#CCFF00] rounded-full animate-[musicbar_0.8s_ease-in-out_infinite]" style={{ height: '40%' }} />
          <span className="w-0.5 bg-[#CCFF00] rounded-full animate-[musicbar_0.8s_ease-in-out_0.2s_infinite]" style={{ height: '100%' }} />
          <span className="w-0.5 bg-[#CCFF00] rounded-full animate-[musicbar_0.8s_ease-in-out_0.4s_infinite]" style={{ height: '60%' }} />
        </span>
      )}
    </button>
  );
}
