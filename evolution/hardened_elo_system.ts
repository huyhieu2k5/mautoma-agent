/**
 * evolution/hardened_elo_system.ts — Pure Elo rating implementation
 *
 * Standard Elo with K-factor adjustment (faster for new players).
 * No subprocesses.
 */

import type { EloConfig, MatchResult, EvolutionAgent } from './types';

const DEFAULT_CONFIG: Required<EloConfig> = {
  defaultElo: 1200,
  kFactorNew: 32,
  kFactorEstablished: 16,
  establishedGames: 10,
};

function expectScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function computeKFactor(gamesPlayed: number, cfg: Required<EloConfig>): number {
  return gamesPlayed < cfg.establishedGames ? cfg.kFactorNew : cfg.kFactorEstablished;
}

/**
 * Update Elo ratings after a match. Returns new ratings + match result.
 */
export function updateElo(
  winner: EvolutionAgent,
  loser: EvolutionAgent,
  config?: EloConfig
): { winnerElo: number; loserElo: number; match: MatchResult } {
  const cfg: Required<EloConfig> = { ...DEFAULT_CONFIG, ...config };

  const expectedWinner = expectScore(winner.elo, loser.elo);
  const expectedLoser = expectScore(loser.elo, winner.elo);

  const kWinner = computeKFactor(winner.wins + winner.losses, cfg);
  const kLoser = computeKFactor(loser.wins + loser.losses, cfg);

  const winnerElo = Math.round(winner.elo + kWinner * (1 - expectedWinner));
  const loserElo = Math.round(loser.elo + kLoser * (0 - expectedLoser));

  const match: MatchResult = {
    winnerId: winner.id,
    loserId: loser.id,
    winnerElo,
    loserElo,
    timestamp: Date.now(),
  };

  return { winnerElo, loserElo, match };
}

/**
 * Expected score for a matchup (probability of A beating B)
 */
export function expectedScore(playerA: { elo: number }, playerB: { elo: number }): number {
  return expectScore(playerA.elo, playerB.elo);
}

/**
 * Get rating category description
 */
export function ratingCategory(elo: number): string {
  if (elo < 1000) return 'Beginner';
  if (elo < 1200) return 'Novice';
  if (elo < 1400) return 'Intermediate';
  if (elo < 1600) return 'Advanced';
  if (elo < 1800) return 'Expert';
  if (elo < 2000) return 'Master';
  return 'Grandmaster';
}