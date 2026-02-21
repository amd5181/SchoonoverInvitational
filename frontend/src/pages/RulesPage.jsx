import { Trophy, DollarSign, Users, Info } from 'lucide-react';

export default function RulesPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in-up" data-testid="rules-page">
      <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight mb-2">RULES & SCORING</h1>
      <p className="text-slate-500 text-sm mb-6">Your team's score is the projected real-money earnings of your 5 golfers based on their current standing in the Masters.</p>

      {/* How Scoring Works */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#1B4332] flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-[#CCFF00]" />
          </div>
          <h2 className="font-heading font-bold text-lg text-[#0F172A]">PROJECTED EARNINGS</h2>
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <p>Each golfer on your team earns projected prize money based on their current finishing position in the tournament.</p>
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <p className="font-semibold text-slate-700">Example</p>
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span>1st place</span><span className="font-numbers font-bold text-[#1B4332]">$3,600,000</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span>2nd place</span><span className="font-numbers font-bold text-[#1B4332]">$2,160,000</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span>3rd place</span><span className="font-numbers font-bold text-[#1B4332]">$800,000</span>
            </div>
            <div className="flex justify-between">
              <span>Missed Cut</span><span className="font-numbers font-bold text-slate-400">$10,000</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
            ★ Any golfer who misses the cut earns a flat <strong className="text-slate-600">$10,000</strong> regardless of position. Players who withdraw (WD) or are disqualified (DQ) earn $0.
          </p>
        </div>
      </div>

      {/* Ties */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-[#2D6A4F] flex items-center justify-center">
            <Users className="w-4 h-4 text-[#CCFF00]" />
          </div>
          <h2 className="font-heading font-bold text-lg text-[#0F172A]">TIES</h2>
        </div>
        <p className="text-sm text-slate-600">When golfers are tied, we sum the payouts for all the positions they occupy and split the total evenly among the tied players.</p>
        <div className="bg-slate-50 rounded-lg p-3 mt-3 text-sm">
          <p className="font-semibold text-slate-700 mb-2">Example — 3-way tie for 2nd</p>
          <p className="text-slate-600 text-xs">Payouts for 2nd + 3rd + 4th are added together and divided by 3. Each tied golfer receives the same equal share.</p>
        </div>
      </div>

      {/* Live Scoring */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Info className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-heading font-bold text-lg text-[#0F172A]">LIVE & PROJECTED</h2>
        </div>
        <p className="text-sm text-slate-600">During the tournament, earnings shown are <strong>projected</strong> based on current standings — they update as golfers move up and down the leaderboard. Scores are estimates and may change once the final tournament earnings are announced, which will be locked once the tournament is complete.</p>
      </div>

      {/* How to Win */}
      <div className="bg-gradient-to-br from-[#1B4332] to-[#081C15] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-[#CCFF00]" />
          <h2 className="font-heading font-bold text-lg">HOW TO WIN</h2>
        </div>
        <ul className="space-y-2 text-sm text-slate-200">
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">1.</span>Build up to 2 teams of 5 golfers within a $1,000,000 salary cap</li>
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">2.</span>Each golfer earns projected prize money based on their current Masters finish</li>
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">3.</span>Your team's total = the sum of all 5 golfers' projected earnings</li>
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">4.</span>Highest total projected earnings wins</li>
        </ul>
      </div>
    </div>
  );
}