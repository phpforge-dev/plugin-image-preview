export const maxZoom = 8;
export const minZoom = 0.05;

/** Fit the image inside the viewport. Undefined until the viewport has been laid out. */
export function fittedScale(width: number, height: number, viewWidth: number, viewHeight: number): number | undefined {
  if (viewWidth < 8 || viewHeight < 8 || width < 1 || height < 1) return undefined;
  const availableWidth = Math.max(1, viewWidth - 48);
  const availableHeight = Math.max(1, viewHeight - 48);
  return Math.min(maxZoom, availableWidth / width, availableHeight / height, 16384 / width, 16384 / height);
}

export function clampZoom(value: number): number {
  return Math.max(minZoom, Math.min(maxZoom, value));
}

export function dataUriBytes(source: string): number {
  const comma = source.indexOf(',');
  if (comma < 0) return 0;
  const body = source.slice(comma + 1);
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(body.length * 3 / 4) - padding);
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function zoomAnchor(viewport: HTMLElement, clientX: number, clientY: number, ratio: number) {
  const rect = viewport.getBoundingClientRect();
  const originX = clientX - rect.left + viewport.scrollLeft;
  const originY = clientY - rect.top + viewport.scrollTop;
  viewport.scrollLeft = originX * ratio - (clientX - rect.left);
  viewport.scrollTop = originY * ratio - (clientY - rect.top);
}

/** Wheel zooms, drag pans, double-click toggles fit and actual size. */
export function bindImagePointer(viewport: HTMLElement, actions: {
  zoomBy(factor: number, clientX: number, clientY: number): void;
  toggleFit(): void;
}, own: (cleanup: () => void) => void) {
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    actions.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
  };
  let drag: { x: number; y: number; left: number; top: number } | undefined;
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  };
  const up = () => { drag = undefined; };
  const dbl = (event: MouseEvent) => { if (event.target === viewport || viewport.contains(event.target as Node)) actions.toggleFit(); };
  viewport.addEventListener('wheel', wheel, { passive: false });
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', up);
  viewport.addEventListener('dblclick', dbl);
  own(() => {
    viewport.removeEventListener('wheel', wheel);
    viewport.removeEventListener('pointerdown', down);
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', up);
    viewport.removeEventListener('pointercancel', up);
    viewport.removeEventListener('dblclick', dbl);
  });
}
