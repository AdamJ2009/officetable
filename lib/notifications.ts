interface MatchNotification {
  gameName: string;
  imageUrl?: string | null;
  matchId: number;
  teams: {
    players: string[];
    score: number;
    result: 'win' | 'loss' | 'draw';
  }[];
  skillChanges: {
    playerName: string;
    change: number;
    rankChange?: number;
  }[];
  notes?: string | null;
  achievements?: {
    playerName: string;
    achievementName: string;
    achievementIcon?: string | null;
  }[];
  timestamp: string;
}

export async function sendGoogleChatNotification(match: MatchNotification): Promise<void> {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (!webhookUrl) {
    console.log('Google Chat webhook URL not configured, skipping notification');
    return;
  }

  // Determine winner/draw status
  const maxScore = Math.max(...match.teams.map(t => t.score));
  const winners = match.teams.filter(t => t.score === maxScore);
  const isDraw = winners.length > 1;

  const scoresLine =`<b><font color='#1147D1'>${match.teams[0].players.join(' & ')} ${match.teams[0].score}</font> - <font color='#D13011'>${match.teams[1].score} ${match.teams[1].players.join(' & ')}</font></b>`

  // Build line 2: match link
  const matchLink = baseUrl ? `${baseUrl}/matches/${match.matchId}` : null;

  // Build line 3: skill shifts per player with rank changes
  const skillShiftsLine = match.skillChanges
    .sort((a, b) => b.change - a.change) // Sort by change descending
    .map(sc => {
      const sign = sc.change >= 0 ? '+' : '';
      const eloPart = `${sc.playerName}: ${sign}${sc.change.toFixed(3)}`;
      const rankPart = sc.rankChange !== undefined
        ? ` (${sc.rankChange > 0 ? '+' : ''}${sc.rankChange} rank${Math.abs(sc.rankChange) !== 1 ? 's' : ''})`
        : '';
      return `${eloPart}${rankPart}`;
    })
    .join('  ·  ');

  // Build widgets for the card
  const widgets = [];

  // Line 1: Scores
  widgets.push({
    textParagraph: {
      text: scoresLine
    }
  });

  // Line 2: Match link (if base URL configured)
  if (matchLink) {
    widgets.push({
      textParagraph: {
        text: `<a href="${matchLink}">View match details</a>`
      }
    });
  }

  // Line 3: Skill shifts with rank changes
  widgets.push({
    textParagraph: {
      text: skillShiftsLine
    }
  });

  // Line 4: Notes (if present)
  if (match.notes?.trim()) {
    widgets.push({
      textParagraph: {
        text: `<i>💬 ${match.notes.trim()}</i>`
      }
    });
  }

  // Line 5: Achievements (if present)
  if (match.achievements && match.achievements.length > 0) {
    const achievementsText = match.achievements
      .map(a => {
        const icon = a.achievementIcon || '🏅';
        const name = a.achievementName.replace(/_/g, ' ');
        return `${icon} <b>${a.playerName}</b>: ${name}`;
      })
      .join('  ·  ');
    widgets.push({
      textParagraph: {
        text: achievementsText
      }
    });
  }

  // Build the cards V2 payload
  const payload = {
    cardsV2: [
      {
        cardId: 'match-result',
        card: {
          header: {
            title: match.gameName,
            subtitle: new Date(match.timestamp).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            }),
            ...(match.imageUrl ? {
              imageUrl: match.imageUrl,
              imageType: 'SQUARE'
            } : {
              imageUrl: isDraw
                ? 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/handshake/default/48px.svg'
                : 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg',
              imageType: 'CIRCLE'
            })
          },
          sections: [
            {
              widgets: widgets
            }
          ]
        }
      }
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Failed to send Google Chat notification:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('Error sending Google Chat notification:', error);
  }
}

export function buildMatchNotification(
  gameName: string,
  matchId: number,
  teams: { player_ids: number[]; score: number }[],
  playerNames: Map<number, string>,
  skillChanges: Map<number, { before: number; after: number; change: number }>,
  imageUrl?: string | null,
  notes?: string | null,
  rankChanges?: Map<number, number>,
  achievements?: { playerId: number; achievementName: string; achievementIcon?: string | null }[]
): MatchNotification {
  const maxScore = Math.max(...teams.map(t => t.score));
  const winners = teams.filter(t => t.score === maxScore);
  const isDraw = winners.length > 1;

  return {
    gameName,
    imageUrl: imageUrl,
    matchId,
    teams: teams.map(team => ({
      players: team.player_ids.map(id => playerNames.get(id) || `Player ${id}`),
      score: team.score,
      result: team.score === maxScore ? (isDraw ? 'draw' : 'win') : 'loss'
    })),
    skillChanges: teams.flatMap(team =>
      team.player_ids.map(id => ({
        playerName: playerNames.get(id) || `Player ${id}`,
        change: skillChanges.get(id)?.change ?? 0,
        rankChange: rankChanges?.get(id)
      }))
    ),
    notes: notes,
    achievements: achievements?.map(a => ({
      playerName: playerNames.get(a.playerId) || `Player ${a.playerId}`,
      achievementName: a.achievementName,
      achievementIcon: a.achievementIcon
    })),
    timestamp: new Date().toISOString()
  };
}
