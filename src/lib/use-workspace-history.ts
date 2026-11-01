import { useCallback, useReducer } from 'react';
import { historyStep, type History, type HistoryAction } from './workspace-history';
export function useWorkspaceHistory<T>(initial: () => T) {
  const [state, dispatch] = useReducer(
    (s: History<T>, a: HistoryAction<T>) => historyStep(s, a),
    undefined,
    () => ({ present: initial(), past: [], future: [] }),
  );
  const setValue = useCallback(
    (value: T | ((current: T) => T)) => dispatch({ type: 'set', value }),
    [],
  );
  const reset = useCallback((value: T) => dispatch({ type: 'reset', value }), []);
  const replace = useCallback(
    (value: T | ((current: T) => T)) => dispatch({ type: 'replace', value }),
    [],
  );
  const checkpoint = useCallback(() => dispatch({ type: 'checkpoint' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []),
    redo = useCallback(() => dispatch({ type: 'redo' }), []);
  return {
    value: state.present,
    setValue,
    reset,
    replace,
    checkpoint,
    undo,
    redo,
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
  };
}
