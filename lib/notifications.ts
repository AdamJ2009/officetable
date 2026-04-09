interface MatchNotification {
  gameName: string;
  teams: {
    players: string[];
    score: number;
    result: 'win' | 'loss' | 'draw';
  }[];
  timestamp: string;
}

interface TeamResult {
  players: string[];
  score: number;
  isWinner: boolean;
  isDraw: boolean;
}

export async function sendGoogleChatNotification(match: MatchNotification): Promise<void> {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log('Google Chat webhook URL not configured, skipping notification');
    return;
  }

  // Determine winner/draw status
  const maxScore = Math.max(...match.teams.map(t => t.score));
  const winners = match.teams.filter(t => t.score === maxScore);
  const isDraw = winners.length > 1;

  // Sort teams by score (highest first)
  const sortedTeams = [...match.teams].sort((a, b) => b.score - a.score);

  // Build sections for each team
  const teamSections = sortedTeams.map((team, index) => {
    const isFirst = index === 0;
    const emoji = isFirst ? (isDraw ? '🤝' : '🏆') : '';
    const resultText = isFirst
      ? (isDraw ? 'Draw' : 'Winner')
      : '';

    return {
      header: `${emoji} ${team.players.join(' & ')}`.trim(),
      widgets: [
        {
          textParagraph: {
            text: `**Score:** ${team.score}${resultText ? `  —  *${resultText}*` : ''}`
          }
        }
      ]
    };
  });

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
            imageUrl: isDraw ? 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/handshake/default/48px.svg' : 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg',
            imageType: 'CIRCLE'
          },
          sections: teamSections
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
  teams: { player_ids: number[]; score: number }[],
  playerNames: Map<number, string>
): MatchNotification {
  const maxScore = Math.max(...teams.map(t => t.score));
  const winners = teams.filter(t => t.score === maxScore);
  const isDraw = winners.length > 1;

  return {
    gameName,
    teams: teams.map(team => ({
      players: team.player_ids.map(id => playerNames.get(id) || `Player ${id}`),
      score: team.score,
      result: team.score === maxScore ? (isDraw ? 'draw' : 'win') : 'loss'
    })),
    timestamp: new Date().toISOString()
  };
}
