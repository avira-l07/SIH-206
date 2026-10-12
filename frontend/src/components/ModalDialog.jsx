import { useEffect, useRef } from 'react';

export default function ModalDialog({ children, label, onClose, wide = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      const returnFocus = previousFocus?.isConnected && previousFocus !== document.body
        ? previousFocus
        : document.querySelector('[data-dialog-return-focus]');
      returnFocus?.focus({ preventScroll: true });
    };
  }, []);
  const keepFocus = (event) => {
    if (event.key !== 'Tab') return;
    const element = dialog.current;
    const controls = [...element.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
      .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); element.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  };
  return <dialog ref={dialog} tabIndex={-1} aria-label={label} onCancel={onClose} onKeyDown={keepFocus} className={`fixed inset-0 m-auto w-[calc(100%_-_2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded border-0 bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-sm`}>{children}</dialog>;
}
