/** Add workspace descriptions here to expose a mode consistently on Home and in navigation. */
export const WORKSPACES = [
  {
    id: 'cards',
    name: 'Proxy Card Builder',
    category: 'Gaming cards',
    description: 'Build decks, choose artwork, and prepare proxy cards to print and cut.',
    icon: 'cards',
    action: 'Build proxy cards',
  },
  {
    id: 'stickers',
    name: 'Stickers',
    category: 'Stickers & labels',
    description: 'Design your own stickers, nest a sheet, and print with matching cut paths.',
    icon: 'stickers',
    action: 'Make stickers',
  },
] as const;
export type WorkspaceId = (typeof WORKSPACES)[number]['id'];
export function workspaceName(id: WorkspaceId) {
  return WORKSPACES.find((w) => w.id === id)!.name;
}
