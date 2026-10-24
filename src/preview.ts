import { bindImagePointer, clampZoom, dataUriBytes, fileSizeLabel, fittedScale, zoomAnchor } from './zoom';

export function activate(sdk: any) {
  const { tr, editorPreviewLayout, own } = sdk;
  const isImagePath = (path: string) => /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i.test(path);
  const controller = mountImagePreview(sdk.host.editor, sdk.api, sdk.host, { tr, editorPreviewLayout, own, isImagePath });
  sdk.provide('imagePreview', controller);
  return controller;
}

function mountImagePreview(editor: any, api: any, hooks: { path(): string | undefined; open?(path: string): Promise<void> }, sdk: { tr: (s: string) => string; editorPreviewLayout: (editor: any) => any; own: (value: any) => void; isImagePath: (path: string) => boolean }) {
  const { tr, editorPreviewLayout, own, isImagePath } = sdk;
  const shared = editorPreviewLayout(editor);
  const active = () => !!editor.getModel() && isImagePath(hooks.path() ?? '');
  const preview = document.createElement('section');
  preview.id = 'image-preview';
  preview.setAttribute('aria-label', tr('Visualizador de imagens'));
  const toolbar = document.createElement('div');
  toolbar.hidden = true;
  const tools = document.createElement('div');
  tools.className = 'image-tools';
  const viewport = document.createElement('div');
  viewport.className = 'image-viewport';
  viewport.tabIndex = 0;
  viewport.dataset.background = 'checker';
  viewport.setAttribute('aria-label', tr('Imagem · role para zoom, arraste para mover, 0 ajusta'));
  const stage = document.createElement('div');
  stage.className = 'image-stage';
  const frame = document.createElement('div');
  frame.className = 'image-frame';
  const grid = document.createElement('div');
  grid.className = 'image-grid';
  grid.hidden = true;
  frame.append(grid);
  stage.append(frame);
  viewport.append(stage);
  const info = document.createElement('div');
  info.className = 'image-info';
  info.setAttribute('role', 'status');
  let generation = 0, image: HTMLImageElement | undefined, scale = 1, fit = true, bytes = 0, siblings: string[] = [], showGrid = false;
  const button = (text: string, label: string, action: () => void) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = tr(text);
    control.title = tr(label);
    control.setAttribute('aria-label', tr(label));
    control.onclick = action;
    return control;
  };
  const zoomOut = button('−', 'Diminuir zoom', () => setZoom(scale / 1.25));
  zoomOut.id = 'image-zoom-out';
  const zoomIn = button('+', 'Aumentar zoom', () => setZoom(scale * 1.25));
  zoomIn.id = 'image-zoom-in';
  const fitButton = button('Ajustar', 'Ajustar imagem à área', () => { fit = true; zoom(); });
  fitButton.id = 'image-fit';
  const actual = button('100%', 'Tamanho original', () => setZoom(1));
  actual.id = 'image-actual';
  const gridButton = button('Grade', 'Mostrar grade', () => { showGrid = !showGrid; grid.hidden = !showGrid; gridButton.setAttribute('aria-pressed', String(showGrid)); });
  gridButton.id = 'image-grid-toggle';
  const previous = button('‹', 'Imagem anterior nesta pasta', () => step(-1));
  previous.id = 'image-previous';
  const next = button('›', 'Imagem seguinte nesta pasta', () => step(1));
  next.id = 'image-next';
  const reloadButton = button('Recarregar', 'Recarregar imagem do disco', () => void reload());
  reloadButton.id = 'image-reload';
  const background = document.createElement('select');
  background.setAttribute('aria-label', tr('Fundo da imagem'));
  for (const [value, label] of [['checker', 'Quadriculado'], ['light', 'Claro'], ['dark', 'Escuro']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = tr(label);
    background.append(option);
  }
  background.onchange = () => { viewport.dataset.background = background.value; };
  tools.append(zoomOut, zoomIn, fitButton, actual, gridButton, previous, next, reloadButton, background);
  preview.append(tools, viewport, info);

  function paint() {
    const ready = !!image;
    for (const control of [zoomOut, zoomIn, fitButton, actual, gridButton]) control.disabled = !ready;
    if (!image) return;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const measured = fit ? fittedScale(width, height, viewport.clientWidth, viewport.clientHeight) : scale;
    if (measured !== undefined && fit) scale = measured;
    const rendered = measured === undefined ? 1 : Math.min(scale, 16384 / width, 16384 / height);
    const shownWidth = width * rendered;
    const shownHeight = height * rendered;
    image.style.width = shownWidth + 'px';
    image.style.height = shownHeight + 'px';
    grid.style.setProperty('--image-grid', Math.max(rendered, 8) + 'px');
    viewport.dataset.pixelated = String(rendered >= 2);
    const format = (hooks.path() ?? '').split('.').pop()!.toUpperCase();
    const size = bytes ? ' · ' + fileSizeLabel(bytes) : '';
    info.textContent = `${width} × ${height} px · ${Math.round(rendered * 100)}% · ${format}${size}`;
    fitButton.setAttribute('aria-pressed', String(fit && measured !== undefined));
  }
  function zoom() { paint(); }
  function setZoom(value: number, anchor?: { x: number; y: number }) {
    const before = scale;
    fit = false;
    scale = clampZoom(value);
    paint();
    if (anchor && before > 0) zoomAnchor(viewport, anchor.x, anchor.y, scale / before);
  }
  function step(direction: number) {
    const path = hooks.path();
    const index = siblings.indexOf(path ?? '');
    const target = index >= 0 ? siblings[index + direction] : undefined;
    if (target && hooks.open) void hooks.open(target);
  }
  function error(message: string) {
    image = undefined;
    paint();
    preview.dataset.state = 'error';
    const box = document.createElement('div');
    box.className = 'image-error';
    box.setAttribute('role', 'alert');
    box.textContent = tr('Não foi possível abrir a imagem.') + ' ' + message;
    box.append(button('Tentar novamente', 'Recarregar imagem do disco', () => void reload()));
    frame.replaceChildren(grid, box);
    info.textContent = tr('Prévia de imagem indisponível');
  }
  async function listSiblings(path: string) {
    siblings = [];
    previous.disabled = true;
    next.disabled = true;
    if (typeof api.tree !== 'function') return;
    try {
      const slash = path.lastIndexOf('/');
      const entries = await api.tree(slash < 0 ? '' : path.slice(0, slash));
      if (hooks.path() !== path) return;
      siblings = entries.filter((entry: { directory?: boolean; path: string }) => !entry.directory && isImagePath(entry.path)).map((entry: { path: string }) => entry.path).sort((a: string, b: string) => a.localeCompare(b));
    } catch { siblings = [path]; }
    const index = siblings.indexOf(path);
    previous.disabled = index <= 0;
    next.disabled = index < 0 || index >= siblings.length - 1;
  }
  async function reload() {
    const token = ++generation;
    const path = hooks.path();
    const model = editor.getModel();
    image = undefined;
    frame.replaceChildren(grid);
    paint();
    if (!active() || !path) return;
    preview.dataset.state = 'loading';
    info.textContent = tr('Carregando imagem…');
    const current = () => token === generation && active() && hooks.path() === path && editor.getModel() === model;
    try {
      const source = await api.readImage(path);
      if (!current()) return;
      bytes = dataUriBytes(source);
      const next = new Image();
      next.alt = path;
      next.draggable = false;
      next.onload = () => {
        if (!current()) return;
        if (!next.naturalWidth || !next.naturalHeight) { error(tr('Dimensões de imagem inválidas.')); return; }
        image = next;
        frame.replaceChildren(next, grid);
        preview.dataset.state = 'ready';
        zoom();
        document.defaultView?.requestAnimationFrame?.(() => { if (current() && fit) zoom(); });
      };
      next.onerror = () => { if (current()) error(tr('Formato incompatível com este sistema ou arquivo danificado.')); };
      next.src = source;
      void listSiblings(path);
    } catch (reason) { if (current()) error(String(reason)); }
  }
  own(shared.register({ active, mode: () => 'preview', preview, toolbar }));
  own(editor.onDidChangeModel(() => { fit = true; scale = 1; bytes = 0; shared.update(); void reload(); }));
  const observer = new ResizeObserver(() => { if (active() && fit) zoom(); });
  observer.observe(viewport);
  own(() => observer.disconnect());
  viewport.onkeydown = event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); step(event.key === 'ArrowLeft' ? -1 : 1); return; }
    if (!['+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === '0') { fit = true; zoom(); } else setZoom(event.key === '-' ? scale / 1.25 : scale * 1.25);
  };
  bindImagePointer(viewport, {
    zoomBy: (factor, x, y) => setZoom(scale * factor, { x, y }),
    toggleFit: () => { if (fit) setZoom(1); else { fit = true; zoom(); } },
  }, cleanup => own(cleanup));
  own(() => { generation++; image = undefined; viewport.onkeydown = null; frame.replaceChildren(); });
  shared.update();
  zoom();
  if (active()) void reload();
  return { reload };
}
