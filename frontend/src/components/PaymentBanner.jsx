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
        {!compact && <p className="text-xs text-slate-500 mt-0.5">Pay via Venmo or PayPal after submitting your team(s).</p>}
      </div>
      <div className="flex items-center gap-2">
        {/* Venmo */}
        <a href="https://venmo.com/u/amd5181" target="_blank" rel="noopener noreferrer"
          title="Pay with Venmo"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#008CFF] hover:bg-[#007AE0] text-white text-xs font-bold transition-colors">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.14 2C19.65 2.84 19.88 3.7 19.88 4.8c0 3.37-2.88 7.74-5.22 10.82H9.27L7.09 2.97l4.64-.44 1.13 9.03c1.05-1.76 2.36-4.53 2.36-6.42 0-1.03-.18-1.73-.44-2.3L19.14 2z"/>
          </svg>
          Venmo
        </a>
        {/* PayPal */}
        <a href="https://paypal.me/adavidfr2006" target="_blank" rel="noopener noreferrer"
          title="Pay with PayPal"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#003087] hover:bg-[#002070] text-white text-xs font-bold transition-colors">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
          </svg>
          PayPal
        </a>
      </div>
      </div>
    </div>
  );
}
