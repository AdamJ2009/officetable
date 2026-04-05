/**
 * Test script demonstrating how skill ratings change based on:
 * 1. Score difference (close games vs blowouts)
 * 2. Ties
 * 3. Players of different skill levels on the same team
 *
 * Run with: npx tsx scripts/test-skill-changes.ts
 */

import { rating, rate } from 'openskill';

// Helper to format rating changes
function formatChange(before: { mu: number; sigma: number }, after: { mu: number; sigma: number }) {
  const muDiff = after.mu - before.mu;
  const sigmaDiff = after.sigma - before.sigma;
  const ratingBefore = before.mu - 3 * before.sigma;
  const ratingAfter = after.mu - 3 * after.sigma;
  const ratingDiff = ratingAfter - ratingBefore;

  return {
    muChange: muDiff.toFixed(2),
    sigmaChange: sigmaDiff.toFixed(3),
    ratingBefore: ratingBefore.toFixed(1),
    ratingAfter: ratingAfter.toFixed(1),
    ratingChange: (ratingDiff >= 0 ? '+' : '') + ratingDiff.toFixed(2)
  };
}

// Calculate weight based on score difference (same as lib/openskill.ts)
function calculateWeight(score1: number | null, score2: number | null): number {
  if (score1 === null || score2 === null) return 1.5;
  const diff = Math.abs(score1 - score2);
  // Base weight 1.5, +0.25 per goal differential
  const weight = 1.5 + (diff * 0.25);
  return Math.min(4.0, Math.max(1.5, weight));
}

// Apply weighting to rating changes (same as lib/openskill.ts)
function applyWeight(
  results: ReturnType<typeof rate>,
  originalTeams: ReturnType<typeof rating>[][],
  weight: number
): { mu: number; sigma: number }[][] {
  return results.map((team, teamIndex) =>
    team.map((playerResult, playerIndex) => {
      const originalRating = originalTeams[teamIndex][playerIndex];
      const muChange = playerResult.mu - originalRating.mu;
      const sigmaChange = playerResult.sigma - originalRating.sigma;

      const weightedMuChange = muChange * weight;
      const weightedSigmaChange = sigmaChange * Math.sqrt(weight);

      return {
        mu: originalRating.mu + weightedMuChange,
        sigma: originalRating.sigma + weightedSigmaChange,
      };
    })
  );
}

console.log('='.repeat(80));
console.log('SKILL RATING CHANGE DEMONSTRATIONS');
console.log('='.repeat(80));

// ============================================================================
// SCENARIO 1: Close game vs Blowout (equal skill players)
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SCENARIO 1: Score Difference Impact (Equal Skill Players)');
console.log('='.repeat(80));

const scenarios = [
  { name: 'Blowout (10-0)', score1: 10, score2: 0 },
  { name: 'Decisive (10-4)', score1: 10, score2: 4 },
  { name: 'Moderate (10-7)', score1: 10, score2: 7 },
  { name: 'Close (10-9)', score1: 10, score2: 9 },
  { name: 'No scores (default weight)', score1: null, score2: null },
];

for (const scenario of scenarios) {
  console.log(`\n--- ${scenario.name} ---`);

  // Two players with default ratings
  const player1Before = rating({ mu: 25, sigma: 8.333 });
  const player2Before = rating({ mu: 25, sigma: 8.333 });

  const teamRatings = [[player1Before], [player2Before]];
  const ranks = [1, 2]; // Player 1 wins

  const weight = calculateWeight(scenario.score1, scenario.score2);
  console.log(`Score: ${scenario.score1}-${scenario.score2}, Weight: ${weight.toFixed(3)}`);

  const rawResults = rate(teamRatings, { rank: ranks, beta: 3.0 });
  const results = applyWeight(rawResults, teamRatings, weight);

  const player1After = results[0][0];
  const player2After = results[1][0];

  const p1Change = formatChange(
    { mu: 25, sigma: 8.333 },
    { mu: player1After.mu, sigma: player1After.sigma }
  );
  const p2Change = formatChange(
    { mu: 25, sigma: 8.333 },
    { mu: player2After.mu, sigma: player2After.sigma }
  );

  console.log(`Winner (P1): μ ${p1Change.muChange}, σ ${p1Change.sigmaChange}, Rating ${p1Change.ratingBefore} → ${p1Change.ratingAfter} (${p1Change.ratingChange})`);
  console.log(`Loser  (P2): μ ${p2Change.muChange}, σ ${p2Change.sigmaChange}, Rating ${p2Change.ratingBefore} → ${p2Change.ratingAfter} (${p2Change.ratingChange})`);
}

// ============================================================================
// SCENARIO 2: Ties (draws)
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SCENARIO 2: Tie Games');
console.log('='.repeat(80));

const tieScenarios = [
  { name: 'High-scoring tie (10-10)', score1: 10, score2: 10 },
  { name: 'Low-scoring tie (2-2)', score1: 2, score2: 2 },
  { name: 'No scores (default)', score1: null, score2: null },
];

for (const scenario of tieScenarios) {
  console.log(`\n--- ${scenario.name} ---`);

  const player1Before = rating({ mu: 25, sigma: 8.333 });
  const player2Before = rating({ mu: 25, sigma: 8.333 });

  const teamRatings = [[player1Before], [player2Before]];
  const ranks = [1, 1]; // Tie - same rank

  const weight = calculateWeight(scenario.score1, scenario.score2);
  console.log(`Score: ${scenario.score1}-${scenario.score2}, Weight: ${weight.toFixed(3)}`);

  const rawResults = rate(teamRatings, { rank: ranks, beta: 3.0 });
  const results = applyWeight(rawResults, teamRatings, weight);

  const player1After = results[0][0];
  const player2After = results[1][0];

  const p1Change = formatChange(
    { mu: 25, sigma: 8.333 },
    { mu: player1After.mu, sigma: player1After.sigma }
  );
  const p2Change = formatChange(
    { mu: 25, sigma: 8.333 },
    { mu: player2After.mu, sigma: player2After.sigma }
  );

  console.log(`Player 1: μ ${p1Change.muChange}, σ ${p1Change.sigmaChange}, Rating ${p1Change.ratingBefore} → ${p1Change.ratingAfter} (${p1Change.ratingChange})`);
  console.log(`Player 2: μ ${p2Change.muChange}, σ ${p2Change.sigmaChange}, Rating ${p2Change.ratingBefore} → ${p2Change.ratingAfter} (${p2Change.ratingChange})`);
}

// ============================================================================
// SCENARIO 3: Different skill levels - Singles
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SCENARIO 3: Different Skill Levels (Singles)');
console.log('='.repeat(80));

const skillDiffs = [
  { name: 'Similar skill', highMu: 27, lowMu: 23 },
  { name: 'Moderate gap', highMu: 32, lowMu: 18 },
  { name: 'Large gap', highMu: 40, lowMu: 10 },
];

for (const diff of skillDiffs) {
  console.log(`\n--- ${diff.name} (μ=${diff.highMu} vs μ=${diff.lowMu}) ---`);

  const highBefore = rating({ mu: diff.highMu, sigma: 6 });
  const lowBefore = rating({ mu: diff.lowMu, sigma: 6 });

  // Expected outcome: higher skill wins
  console.log('\nExpected outcome (high skill wins, weight=1.0):');
  let rawResults = rate([[highBefore], [lowBefore]], { rank: [1, 2], beta: 3.0 });
  let results = applyWeight(rawResults, [[highBefore], [lowBefore]], 1.0);

  let highAfter = results[0][0];
  let lowAfter = results[1][0];

  let highChange = formatChange(
    { mu: diff.highMu, sigma: 6 },
    { mu: highAfter.mu, sigma: highAfter.sigma }
  );
  let lowChange = formatChange(
    { mu: diff.lowMu, sigma: 6 },
    { mu: lowAfter.mu, sigma: lowAfter.sigma }
  );

  console.log(`Winner (High): μ ${highChange.muChange}, Rating ${highChange.ratingBefore} → ${highChange.ratingAfter} (${highChange.ratingChange})`);
  console.log(`Loser  (Low):  μ ${lowChange.muChange}, Rating ${lowChange.ratingBefore} → ${lowChange.ratingAfter} (${lowChange.ratingChange})`);

  // Upset: lower skill wins
  console.log('\nUpset outcome (low skill wins, weight=1.0):');
  rawResults = rate([[highBefore], [lowBefore]], { rank: [2, 1], beta: 3.0 });
  results = applyWeight(rawResults, [[highBefore], [lowBefore]], 1.0);

  highAfter = results[0][0];
  lowAfter = results[1][0];

  highChange = formatChange(
    { mu: diff.highMu, sigma: 6 },
    { mu: highAfter.mu, sigma: highAfter.sigma }
  );
  lowChange = formatChange(
    { mu: diff.lowMu, sigma: 6 },
    { mu: lowAfter.mu, sigma: lowAfter.sigma }
  );

  console.log(`Loser  (High): μ ${highChange.muChange}, Rating ${highChange.ratingBefore} → ${highChange.ratingAfter} (${highChange.ratingChange})`);
  console.log(`Winner (Low):  μ ${lowChange.muChange}, Rating ${lowChange.ratingBefore} → ${lowChange.ratingAfter} (${lowChange.ratingChange})`);
}

// ============================================================================
// SCENARIO 4: Different skill levels on same team (Doubles)
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SCENARIO 4: Mixed Skill Teams (Doubles)');
console.log('='.repeat(80));

console.log('\nSetup: Team A has high+low skill players, Team B has medium skill players');
console.log('Team A: Player1 (μ=35) + Player2 (μ=15) → Avg μ=25');
console.log('Team B: Player3 (μ=25) + Player4 (μ=25) → Avg μ=25');

const p1Before = rating({ mu: 35, sigma: 6 }); // High skill on Team A
const p2Before = rating({ mu: 15, sigma: 6 }); // Low skill on Team A
const p3Before = rating({ mu: 25, sigma: 6 }); // Team B
const p4Before = rating({ mu: 25, sigma: 6 }); // Team B

const teamA = [p1Before, p2Before];
const teamB = [p3Before, p4Before];

// Team A wins
console.log('\n--- Team A (mixed) wins vs Team B (balanced), weight=1.0 ---');
let rawResults = rate([teamA, teamB], { rank: [1, 2], beta: 3.0 });
let results = applyWeight(rawResults, [teamA, teamB], 1.0);

let p1After = results[0][0];
let p2After = results[0][1];
let p3After = results[1][0];
let p4After = results[1][1];

console.log('Team A (winners):');
console.log(`  Player1 (high): μ ${(p1After.mu - 35).toFixed(2)}, Rating ${(35 - 18).toFixed(1)} → ${(p1After.mu - 3 * p1After.sigma).toFixed(1)}`);
console.log(`  Player2 (low):  μ ${(p2After.mu - 15).toFixed(2)}, Rating ${(15 - 18).toFixed(1)} → ${(p2After.mu - 3 * p2After.sigma).toFixed(1)}`);

console.log('Team B (losers):');
console.log(`  Player3: μ ${(p3After.mu - 25).toFixed(2)}, Rating ${(25 - 18).toFixed(1)} → ${(p3After.mu - 3 * p3After.sigma).toFixed(1)}`);
console.log(`  Player4: μ ${(p4After.mu - 25).toFixed(2)}, Rating ${(25 - 18).toFixed(1)} → ${(p4After.mu - 3 * p4After.sigma).toFixed(1)}`);

// Team B wins (upset for the high-skill player on Team A)
console.log('\n--- Team B (balanced) wins vs Team A (mixed), weight=1.0 ---');
rawResults = rate([teamA, teamB], { rank: [2, 1], beta: 3.0 });
results = applyWeight(rawResults, [teamA, teamB], 1.0);

p1After = results[0][0];
p2After = results[0][1];
p3After = results[1][0];
p4After = results[1][1];

console.log('Team A (losers):');
console.log(`  Player1 (high): μ ${(p1After.mu - 35).toFixed(2)}, Rating ${(35 - 18).toFixed(1)} → ${(p1After.mu - 3 * p1After.sigma).toFixed(1)}`);
console.log(`  Player2 (low):  μ ${(p2After.mu - 15).toFixed(2)}, Rating ${(15 - 18).toFixed(1)} → ${(p2After.mu - 3 * p2After.sigma).toFixed(1)}`);

console.log('Team B (winners):');
console.log(`  Player3: μ ${(p3After.mu - 25).toFixed(2)}, Rating ${(25 - 18).toFixed(1)} → ${(p3After.mu - 3 * p3After.sigma).toFixed(1)}`);
console.log(`  Player4: μ ${(p4After.mu - 25).toFixed(2)}, Rating ${(25 - 18).toFixed(1)} → ${(p4After.mu - 3 * p4After.sigma).toFixed(1)}`);

// ============================================================================
// SCENARIO 5: Weight impact on mixed-skill teams
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SCENARIO 5: Weight Impact on Mixed-Skill Team');
console.log('='.repeat(80));

const mixedScenarios = [
  { name: 'Blowout (10-0)', score1: 10, score2: 0 },
  { name: 'Decisive (10-4)', score1: 10, score2: 4 },
  { name: 'Moderate (10-7)', score1: 10, score2: 7 },
  { name: 'Close (10-9)', score1: 10, score2: 9 },
];

for (const scenario of mixedScenarios) {
  const weight = calculateWeight(scenario.score1, scenario.score2);
  console.log(`\n--- ${scenario.name}, Team A (high+low) wins, weight=${weight.toFixed(3)} ---`);

  const p1 = rating({ mu: 35, sigma: 6 });
  const p2 = rating({ mu: 15, sigma: 6 });
  const p3 = rating({ mu: 25, sigma: 6 });
  const p4 = rating({ mu: 25, sigma: 6 });

  const rawResults = rate([[p1, p2], [p3, p4]], { rank: [1, 2], beta: 3.0 });
  const results = applyWeight(rawResults, [[p1, p2], [p3, p4]], weight);

  const p1After = results[0][0];
  const p2After = results[0][1];
  const p3After = results[1][0];
  const p4After = results[1][1];

  console.log('Team A (winners):');
  console.log(`  Player1 (μ=35): μ change=${(p1After.mu - 35).toFixed(2)}, σ change=${(p1After.sigma - 6).toFixed(3)}`);
  console.log(`  Player2 (μ=15): μ change=${(p2After.mu - 15).toFixed(2)}, σ change=${(p2After.sigma - 6).toFixed(3)}`);
  console.log('Team B (losers):');
  console.log(`  Player3 (μ=25): μ change=${(p3After.mu - 25).toFixed(2)}, σ change=${(p3After.sigma - 6).toFixed(3)}`);
  console.log(`  Player4 (μ=25): μ change=${(p4After.mu - 25).toFixed(2)}, σ change=${(p4After.sigma - 6).toFixed(3)}`);
}

// ============================================================================
// SCENARIO 6: Same match with different weights side-by-side
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('SCENARIO 6: Side-by-Side Comparison - Equal Players');
console.log('='.repeat(80));

console.log('\nComparing μ changes for the same match outcome with different score margins:');
console.log('(Winner μ=25, Loser μ=25, σ=8.333 for both)\n');

const weights = [0.5, 0.75, 1.0, 1.5, 2.0];
const scoreExamples = ['10-9 (close)', '10-7 (moderate)', '10-4 (decisive)', '10-2 (large margin)', '10-0 (blowout)'];

console.log('Weight | Score Margin | Winner μ Δ | Loser μ Δ | Rating Δ (winner)');
console.log('-------|--------------|------------|-----------|------------------');

const weightExamples = [
  { weight: 0.5, desc: '10-9 (close)' },
  { weight: 1.0, desc: 'no score' },
  { weight: 2.0, desc: '10-0 (blowout)' },
];

for (const ex of weightExamples) {
  const p1 = rating({ mu: 25, sigma: 8.333 });
  const p2 = rating({ mu: 25, sigma: 8.333 });

  const rawResults = rate([[p1], [p2]], { rank: [1, 2], beta: 3.0 });
  const results = applyWeight(rawResults, [[p1], [p2]], ex.weight);

  const muChange = results[0][0].mu - 25;
  const loserMuChange = results[1][0].mu - 25;
  const ratingChange = (results[0][0].mu - 3 * results[0][0].sigma) - (25 - 3 * 8.333);

  console.log(`  ${ex.weight.toFixed(1)}  | ${ex.desc.padEnd(12)} | ${muChange >= 0 ? '+' : ''}${muChange.toFixed(2).padStart(6)} | ${loserMuChange.toFixed(2).padStart(8)} | ${ratingChange >= 0 ? '+' : ''}${ratingChange.toFixed(2)}`);
}

console.log('\n' + '='.repeat(80));
console.log('KEY INSIGHTS');
console.log('='.repeat(80));
console.log(`
1. SCORE WEIGHTING EFFECT:
   - Weight 0.5 (close 10-9): ~50% of standard rating change
   - Weight 1.0 (no score): standard rating change
   - Weight 2.0 (blowout 10-0): ~200% of standard rating change

   Close games are treated as less decisive evidence of skill difference,
   while blowouts strongly confirm the expected skill hierarchy.

2. SKILL DIFFERENCES:
   - Expected wins: smaller μ increase (model already expected this outcome)
   - Upsets: larger μ swing (model corrects its belief significantly)
   - Higher σ = more uncertainty = larger potential swings

3. MIXED-SKILL TEAMS:
   - All players on a team move in the same direction (win/loss)
   - The magnitude depends on how surprising the result was for them
   - High-skill player gains less from expected wins, loses more from upsets
   - Low-skill player gains more from wins (overperforming expectation)

4. UNCERTAINTY (σ):
   - σ decreases after each game (model becomes more confident)
   - Weight affects σ reduction: higher weight = faster confidence gain
   - New players (σ=8.333) see larger changes than experienced players (σ=3)

5. PRACTICAL IMPLICATIONS:
   - Recording scores helps distinguish flukes from dominant performances
   - A 10-9 loss shouldn't hurt as much as a 10-0 loss
   - A 10-0 win should boost confidence more than a 10-9 win
`);