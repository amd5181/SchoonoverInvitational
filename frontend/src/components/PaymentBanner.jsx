// PaymentBanner — reusable component used on Home and My Teams
// Props: compact (bool) — smaller version for My Teams
export default function PaymentBanner({ compact = false }) {
  return (
    <div className={`bg-gradient-to-r from-[#1B4332]/5 to-[#2D6A4F]/5 border border-[#1B4332]/15 rounded-xl ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className={`font-bold text-[#0F172A] ${compact ? 'text-sm' : 'text-base'}`}>
            Entry Fee: <span className="text-[#1B4332]">$20 / team</span>
            <span className="text-slate-400 font-normal mx-2">·</span>
            <span className="text-slate-500 font-normal text-sm">2 teams = $40</span>
          </p>
          {!compact && <p className="text-xs text-slate-500 mt-0.5">Pay via Venmo after submitting your team(s).</p>}
        </div>
        <a href="https://venmo.com/u/Curtis-Schoonover" target="_blank" rel="noopener noreferrer"
          title="Pay with Venmo"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#008CFF] hover:bg-[#007AE0] text-white text-xs font-bold transition-colors self-start sm:self-auto">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.14 2C19.65 2.84 19.88 3.7 19.88 4.8c0 3.37-2.88 7.74-5.22 10.82H9.27L7.09 2.97l4.64-.44 1.13 9.03c1.05-1.76 2.36-4.53 2.36-6.42 0-1.03-.18-1.73-.44-2.3L19.14 2z"/>
          </svg>
          Pay with Venmo
        </a>
      </div>
    </div>
  );
}