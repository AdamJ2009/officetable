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

  // Format teams for display
  const formatTeam = (team: { players: string[]; score: number }) => {
    return `${team.players.join(' & ')} (${team.score})`;
  };

  // Build the message
  let messageText: string;

  if (isDraw) {
    messageText = `🤝 **Draw** in ${match.gameName}!\n\n${match.teams.map(t => formatTeam(t)).join(' vs ')}`;
  } else {
    const winningTeam = match.teams.find(t => t.score === maxScore)!;
    const losingTeams = match.teams.filter(t => t.score !== maxScore);

    messageText = `🏆 **${winningTeam.players.join(' & ')}** defeated ${losingTeams.map(t => t.players.join(' & ')).join(' & ')} in ${match.gameName}!\n\n` +
      `Score: ${match.teams.map(t => `${t.score}`).join(' - ')}\n` +
      `${winningTeam.players.join(' & ')}: ${winningTeam.score}\n` +
      `${losingTeams.map(t => `${t.players.join(' & ')}: ${t.score}`).join('\n')}`;
  }

  const payload = {
    text: messageText
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
