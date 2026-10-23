import { useCallback, useState } from 'react';
import { uid } from '../types';

export interface Toast {
  id: string;
  text: string;
  kind: 'success' | 'info' | 'error';
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = uid();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  return { toasts, pushToast, dismissToast };
}

export function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-host" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span><span aria-hidden="true">{t.kind === 'success' ? '✓ ' : t.kind === 'error' ? '⚠ ' : ''}</span>{t.text}</span>
          <button className="toast-dismiss" aria-label={`Dismiss: ${t.text}`} onClick={() => onDismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
