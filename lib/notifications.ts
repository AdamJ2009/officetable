interface MatchNotification {
  gameName: string;
  imageUrl?: string | null;
  matchId: number;
  teams: {
    playerIds: number[];
    players: string[];
    score: number;
    result: 'win' | 'loss' | 'draw';
  }[];
  playerAvatars?: Map<number, string>;
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
  punditry?: {
    description: string;
  }[];
  timestamp: string;
}

const WIN_COLOR = '#16a34a';
const LOSS_COLOR = '#dc2626';

/**
 * Default "person" icon used as a placeholder for players without an avatar.
 * Kept circular so it crops identically to real avatars.
 */
const PERSON_PLACEHOLDER_ICON_URL = 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/person/default/48px.svg';

/**
 * Builds the face-off section: one column per team, each player as a row with
 * their avatar (or a person placeholder), bold name and coloured skill change.
 * Handles any team size (1v1, 2v2, ...).
 */
export function buildFaceOffColumnsWidget(
  match: MatchNotification,
  skillChangeByName: Map<string, { change: number; rankChange?: number }>
): Record<string, unknown> {
  const columnItems = match.teams.slice(0, 4).map(team => ({
    horizontalSizeStyle: 'FILL_AVAILABLE_SPACE',
    horizontalAlignment: 'CENTER' as const,
    verticalAlignment: 'TOP' as const,
    widgets: team.playerIds.map((id, index) => {
      const name = team.players[index];
      const skill = skillChangeByName.get(name);
      const sign = skill && skill.change >= 0 ? '+' : '';
      const rankPart = skill?.rankChange !== undefined && skill.rankChange !== 0
        ? ` (${skill.rankChange > 0 ? '+' : ''}${skill.rankChange} rank${Math.abs(skill.rankChange) !== 1 ? 's' : ''})`
        : '';
      const skillText = skill
        ? ` <font color='${skill.change >= 0 ? WIN_COLOR : LOSS_COLOR}'>${sign}${skill.change.toFixed(3)}</font>${rankPart}`
        : '';

      const avatarUrl = match.playerAvatars?.get(id);

      return {
        decoratedText: {
          startIcon: avatarUrl
            ? {
                imageType: 'CIRCLE' as const,
                iconUrl: avatarUrl,
                altText: name,
              }
            : {
                imageType: 'CIRCLE' as const,
                iconUrl: PERSON_PLACEHOLDER_ICON_URL,
              },
          text: `<b>${name}</b>${skillText}`,
          wrapText: true
        }
      };
    })
  }));

  return { columns: { columnItems } };
}

export function buildChatCardsPayload(match: MatchNotification): Record<string, unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  // Determine winner/draw status
  const maxScore = Math.max(...match.teams.map(t => t.score));
  const winners = match.teams.filter(t => t.score === maxScore);
  const isDraw = winners.length > 1;

  // Header shows the game/sport identity: game image if set, otherwise a default symbol
  const headerImageUrl = match.imageUrl || (isDraw
    ? 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/handshake/default/48px.svg'
    : 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg');
  const headerImageType = match.imageUrl ? 'SQUARE' : 'CIRCLE';

  const scoresLine =`<b><font color='#1147D1'>${match.teams[0].players.join(' & ')} ${match.teams[0].score}</font> - <font color='#D13011'>${match.teams[1].score} ${match.teams[1].players.join(' & ')}</font></b>`

  // Build line 2: match link
  const matchLink = baseUrl ? `${baseUrl}/matches/${match.matchId}` : null;

  // Skill change + rank change per player name, for the face-off rows
  const skillChangeByName = new Map(
    match.skillChanges.map(sc => [sc.playerName, { change: sc.change, rankChange: sc.rankChange }])
  );

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

  // Line 3: Face-off columns — one column per team; each player is a row with
  // their avatar (or person placeholder), name and coloured skill change.
  widgets.push(buildFaceOffColumnsWidget(match, skillChangeByName));

  // Line 4: Notes (if present)
  if (match.notes?.trim()) {
    widgets.push({
      textParagraph: {
        text: `<i>\u{1F4AC} ${match.notes.trim()}</i>`
      }
    });
  }

  // Line 5: Achievements (if present)
  if (match.achievements && match.achievements.length > 0) {
    const achievementsText = match.achievements
      .map(a => {
        const icon = a.achievementIcon || '\u{1F3C5}';
        const name = a.achievementName.replace(/_/g, ' ');
        return `${icon} <b>${a.playerName}</b>: ${name}`;
      })
      .join('  \u00b7  ');
    widgets.push({
      textParagraph: {
        text: achievementsText
      }
    });
  }

  // Line 6: Punditry (if present)
  if (match.punditry && match.punditry.length > 0) {
    const punditryText = match.punditry
      .slice(0, 3) // Limit to 3 facts to keep the notification concise
      .map(p => `\u{1F399}\u{FE0F} ${p.description}`)
      .join('<br>');
    const suffix = match.punditry.length > 3 ? `<br><i>...and ${match.punditry.length - 3} more insights</i>` : '';
    widgets.push({
      textParagraph: {
        text: punditryText + suffix
      }
    });
  }

  return {
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
            imageUrl: headerImageUrl,
            imageType: headerImageType
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
}

export async function sendGoogleChatNotification(match: MatchNotification): Promise<void> {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log('Google Chat webhook URL not configured, skipping notification');
    return;
  }

  // Build the cards V2 payload
  const payload = buildChatCardsPayload(match);

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
  achievements?: { playerId: number; achievementName: string; achievementIcon?: string | null }[],
  punditry?: { description: string }[],
  playerAvatars?: Map<number, string>
): MatchNotification {
  const maxScore = Math.max(...teams.map(t => t.score));
  const winners = teams.filter(t => t.score === maxScore);
  const isDraw = winners.length > 1;

  return {
    gameName,
    imageUrl: imageUrl,
    matchId,
    teams: teams.map(team => ({
      playerIds: team.player_ids,
      players: team.player_ids.map(id => playerNames.get(id) || `Player ${id}`),
      score: team.score,
      result: team.score === maxScore ? (isDraw ? 'draw' : 'win') : 'loss'
    })),
    playerAvatars,
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
    punditry: punditry?.map(p => ({ description: p.description })),
    timestamp: new Date().toISOString()
  };
}
