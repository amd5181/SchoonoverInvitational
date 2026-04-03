// PaymentBanner — reusable component used on Home and My Teams
// Props: compact (bool) — smaller version for My Teams
export default function PaymentBanner({ compact = false }) {
  return (
    <div className={`bg-gradient-to-r from-[#1B4332]/5 to-[#2D6A4F]/5 border border-[#1B4332]/15 rounded-xl ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className={`font-bold text-[#0F172A] ${compact ? 'text-sm' : 'text-base'}`}>
            Entry Fee: <span className="text-[#1B4332]">$20 / team</span>
          </p>
          {!compact && <p className="text-xs text-slate-500 mt-0.5">Pay via Venmo or PayPal after submitting your team(s).</p>}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a href="https://venmo.com/u/Curtis-Schoonover" target="_blank" rel="noopener noreferrer"
            title="Pay with Venmo"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#008CFF] hover:bg-[#007AE0] text-white text-xs font-bold transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.14 2C19.65 2.84 19.88 3.7 19.88 4.8c0 3.37-2.88 7.74-5.22 10.82H9.27L7.09 2.97l4.64-.44 1.13 9.03c1.05-1.76 2.36-4.53 2.36-6.42 0-1.03-.18-1.73-.44-2.3L19.14 2z"/>
            </svg>
            Pay with Venmo
          </a>
          <a href="https://paypal.me/curtisschoonover730" target="_blank" rel="noopener noreferrer"
            title="Pay with PayPal"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#003087] hover:bg-[#002070] text-white text-xs font-bold transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.773.773 0 0 1 .762-.653h6.648c2.2 0 3.817.511 4.8 1.52.944.968 1.25 2.286.908 3.92l-.006.033c-.527 2.67-2.09 4.37-4.643 4.87-.704.135-1.46.2-2.247.2H9.01a.77.77 0 0 0-.762.652l-.885 5.61a.641.641 0 0 1-.633.465H7.076zm9.717-12.23c-.02.13-.044.26-.073.393-.688 3.533-3.042 4.753-6.048 4.753H8.95a.77.77 0 0 0-.762.652l-1.02 6.463-.29 1.835a.641.641 0 0 0 .633.74h3.43a.677.677 0 0 0 .668-.572l.028-.143.53-3.358.034-.184a.677.677 0 0 1 .668-.573h.42c2.724 0 4.856-1.106 5.48-4.307.26-1.336.126-2.45-.563-3.234a2.68 2.68 0 0 0-.767-.465z"/>
            </svg>
            Pay with PayPal
          </a>
        </div>
      </div>
    </div>
  );
}