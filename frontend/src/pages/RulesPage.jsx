import { Trophy, Target } from 'lucide-react';

const PLACE_POINTS = [
  ['1st', 300], ['2nd', 200], ['3rd', 175], ['4th', 150], ['5th', 125],
  ['6th', 100], ['7th', 90], ['8th', 80], ['9th', 70], ['10th', 60],
  ['11th', 55], ['12th', 54], ['13th', 53], ['14th', 52], ['15th', 51],
];

const STROKE_POINTS = [
  ['Leader / Wins Playoff', 100], ['1 stroke behind', 85], ['2 strokes behind', 80],
  ['3 strokes behind', 75], ['4 strokes behind', 70], ['5 strokes behind', 65],
];

export default function RulesPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in-up" data-testid="rules-page">
      <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight mb-2">RULES & SCORING</h1>
      <p className="text-slate-500 text-sm mb-6">Teams earn points based on a player's final Place and how many Strokes Behind they finished from the tournament leader. This balanced approach rewards both stars and depth picks.</p>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#1B4332] flex items-center justify-center">
            <Trophy className="w-4 h-4 text-[#CCFF00]" />
          </div>
          <h2 className="font-heading font-bold text-lg text-[#0F172A]">PLACE POINTS</h2>
        </div>
        <div className="space-y-0">
          {PLACE_POINTS.map(([place, pts]) => (
            <div key={place} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
              <span className="text-sm font-medium text-slate-600">{place}</span>
              <span className="text-sm font-bold font-numbers text-[#1B4332] bg-[#1B4332]/5 px-3 py-0.5 rounded-full">{pts}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-xs text-slate-400 border-t border-slate-100 pt-3">
          <p>Each additional place after 15th: 1 point less (down to 0 points)</p>
          <p>Missed Cut / WD / DQ = 0 points</p>
          <p className="text-[#1B4332] font-semibold">★ Any player who makes the cut earns a minimum of 5 points, regardless of finish position</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#2D6A4F] flex items-center justify-center">
            <Target className="w-4 h-4 text-[#CCFF00]" />
          </div>
          <h2 className="font-heading font-bold text-lg text-[#0F172A]">STROKE POINTS</h2>
        </div>
        <div className="space-y-0">
          {STROKE_POINTS.map(([label, pts]) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
              <span className="text-sm font-medium text-slate-600">{label}</span>
              <span className="text-sm font-bold font-numbers text-[#2D6A4F] bg-[#2D6A4F]/5 px-3 py-0.5 rounded-full">{pts}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-xs text-slate-400 border-t border-slate-100 pt-3">
          <p>Each additional stroke after 5: 5 points less (down to 0 at 19+ strokes behind)</p>
          <p>CUT / WD / DQ = 0 points</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-4">
        <h3 className="font-heading font-bold text-sm text-[#0F172A] uppercase tracking-wider mb-3">Tie-Breaking</h3>
        <p className="text-sm text-slate-600">When golfers are tied, their Place Points are averaged across the tied positions. For example, if 3 golfers are tied for 2nd, each receives the average of 2nd + 3rd + 4th place points. Stroke Points are calculated identically for all tied golfers since they share the same strokes behind.</p>
      </div>

      <div className="bg-gradient-to-br from-[#1B4332] to-[#081C15] rounded-xl p-5 text-white">
        <h2 className="font-heading font-bold text-lg mb-2">HOW TO WIN</h2>
        <ul className="space-y-2 text-sm text-slate-200">
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">1.</span>Build up to 2 teams of 5 golfers within a $1,000,000 budget</li>
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">2.</span>Each golfer earns Place Points + Stroke Points based on their finish</li>
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">3.</span>Your team's total = sum of all 5 golfers' points</li>
          <li className="flex items-start gap-2"><span className="text-[#CCFF00] font-bold mt-0.5">4.</span>Top 3 teams per tournament take the glory</li>
        </ul>
      </div>
    </div>
  );
}
