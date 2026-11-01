export type History<T> = { present: T; past: T[]; future: T[] };
export type HistoryAction<T> =
  | { type: 'set' | 'replace'; value: T | ((current: T) => T) }
  | { type: 'checkpoint' }
  | { type: 'reset'; value: T }
  | { type: 'undo' | 'redo' };
export function historyStep<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  if (action.type === 'reset') return { present: action.value, past: [], future: [] };
  if (action.type === 'checkpoint')
    return { ...state, past: [...state.past, state.present].slice(-40), future: [] };
  if (action.type === 'set' || action.type === 'replace') {
    const next =
      typeof action.value === 'function'
        ? (action.value as (v: T) => T)(state.present)
        : action.value;
    return next === state.present
      ? state
      : action.type === 'replace'
        ? { ...state, present: next }
        : { present: next, past: [...state.past, state.present].slice(-40), future: [] };
  }
  const source = action.type === 'undo' ? state.past : state.future;
  if (!source.length) return state;
  return action.type === 'undo'
    ? {
        present: source.at(-1)!,
        past: source.slice(0, -1),
        future: [...state.future, state.present],
      }
    : {
        present: source.at(-1)!,
        past: [...state.past, state.present],
        future: source.slice(0, -1),
      };
}
export function workspaceShortcut(
  e: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    defaultPrevented: boolean;
  },
  editing = false,
) {
  if (editing || e.defaultPrevented || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'delete' && !e.ctrlKey && !e.metaKey && !e.shiftKey) return 'delete';
  if (!(e.ctrlKey || e.metaKey)) return;
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
  if (!e.shiftKey) return ({ x: 'cut', c: 'copy', v: 'paste' } as const)[key as 'x' | 'c' | 'v'];
}
export function isTextEditing(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const editor = target.closest('input,textarea,[contenteditable="true"],[role="textbox"]');
  if (!editor) return false;
  return (
    editor.tagName !== 'INPUT' ||
    !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color'].includes(
      editor.getAttribute('type') ?? 'text',
    )
  );
}
