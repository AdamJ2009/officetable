// Consistent gradient per player name, used for fallback initials avatars
export function getPlayerGradient(name: string): string {
  const gradients = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-violet-600',
    'from-orange-500 to-amber-600',
    'from-pink-500 to-rose-600',
    'from-cyan-500 to-sky-600',
    'from-fuchsia-500 to-purple-600',
    'from-lime-500 to-green-600',
  ];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
}