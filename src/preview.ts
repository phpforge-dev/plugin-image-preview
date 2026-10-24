export function activate(sdk:any){
const {tr,editorPreviewLayout,own}=sdk;

const isImagePath = (path: string) => /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i.test(path);

function mountImagePreview(editor:any, api:any, hooks: { path(): string | undefined }) {
 const shared = editorPreviewLayout(editor);
 const active = () => !!editor.getModel() && isImagePath(hooks.path() ?? '');
 const preview = document.createElement('section'); preview.id = 'image-preview'; preview.setAttribute('aria-label', tr('Visualizador de imagens'));
 const toolbar = document.createElement('div'); toolbar.hidden = true;
 const tools = document.createElement('div'); tools.className = 'image-tools';
 const viewport = document.createElement('div'); viewport.className = 'image-viewport'; viewport.tabIndex = 0; viewport.dataset.background = 'checker'; viewport.setAttribute('aria-label', tr('Imagem · use + e − para zoom, 0 para ajustar'));
 const stage = document.createElement('div'); stage.className = 'image-stage'; viewport.append(stage);
 const info = document.createElement('div'); info.className = 'image-info'; info.setAttribute('role', 'status');
 let generation = 0, image: HTMLImageElement | undefined, scale = 1, fit = true;
 const button = (text: string, label: string, action: () => void) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = tr(text); b.title = tr(label); b.setAttribute('aria-label', tr(label)); b.onclick = action; return b;
 };
 const zoomOut = button('−', 'Diminuir zoom', () => setZoom(scale / 1.25)); zoomOut.id = 'image-zoom-out';
 const zoomIn = button('+', 'Aumentar zoom', () => setZoom(scale * 1.25)); zoomIn.id = 'image-zoom-in';
 const fitButton = button('Ajustar', 'Ajustar imagem à área', () => { fit = true; zoom(); }); fitButton.id = 'image-fit';
 const actual = button('100%', 'Tamanho original', () => setZoom(1)); actual.id = 'image-actual';
 const reloadButton = button('Recarregar', 'Recarregar imagem do disco', () => void reload()); reloadButton.id = 'image-reload';
 const background = document.createElement('select'); background.setAttribute('aria-label', tr('Fundo da imagem'));
 for (const [value, label] of [['checker', 'Quadriculado'], ['light', 'Claro'], ['dark', 'Escuro']]) { const option = document.createElement('option'); option.value = value; option.textContent = tr(label); background.append(option); }
 background.onchange = () => { viewport.dataset.background = background.value; };
 tools.append(zoomOut, zoomIn, fitButton, actual, reloadButton, background); preview.append(tools, viewport, info);
 function zoom() {
  const ready = !!image; for (const b of [zoomOut, zoomIn, fitButton, actual]) b.disabled = !ready;
  if (!image) return;
  const width = image.naturalWidth, height = image.naturalHeight;
  if (fit) scale = Math.min(1, Math.max(1, viewport.clientWidth - 40) / width, Math.max(1, viewport.clientHeight - 40) / height);
  const rendered = Math.min(scale, 16384 / width, 16384 / height);
  image.style.width = width * rendered + 'px'; image.style.height = height * rendered + 'px';
  info.textContent = `${width} × ${height} px · ${Math.round(rendered * 100)}% · ${(hooks.path() ?? '').split('.').pop()!.toUpperCase()}`;
  fitButton.setAttribute('aria-pressed', String(fit));
 }
 function setZoom(value: number) { fit = false; scale = Math.max(.05, Math.min(8, value)); zoom(); }
 function error(message: string) {
  image = undefined; zoom(); preview.dataset.state = 'error';
  const box = document.createElement('div'); box.className = 'image-error'; box.setAttribute('role', 'alert'); box.textContent = tr('Não foi possível abrir a imagem.') + ' ' + message;
  box.append(button('Tentar novamente', 'Recarregar imagem do disco', () => void reload())); stage.replaceChildren(box); info.textContent = tr('Prévia de imagem indisponível');
 }
 async function reload() {
  const token = ++generation, path = hooks.path(), model = editor.getModel(); image = undefined; stage.replaceChildren(); zoom();
  if (!active() || !path) return;
  preview.dataset.state = 'loading'; info.textContent = tr('Carregando imagem…');
  const current = () => token === generation && active() && hooks.path() === path && editor.getModel() === model;
  try {
   const source = await api.readImage(path); if (!current()) return;
   const next = new Image(); next.alt = path; next.draggable = false;
   next.onload = () => { if (!current()) return; if (!next.naturalWidth || !next.naturalHeight) { error(tr('Dimensões de imagem inválidas.')); return; } image = next; stage.replaceChildren(next); preview.dataset.state = 'ready'; zoom(); };
   next.onerror = () => { if (current()) error(tr('Formato incompatível com este sistema ou arquivo danificado.')); };
   next.src = source;
  } catch (e) { if (current()) error(String(e)); }
 }
 own(shared.register({ active, mode: () => 'preview', preview, toolbar }));
 own(editor.onDidChangeModel(() => { fit = true; scale = 1; shared.update(); void reload(); }));
 const observer=new ResizeObserver(() => { if (active() && fit) zoom(); });observer.observe(viewport);own(()=>observer.disconnect());
 viewport.onkeydown = event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (['+', '=', '-', '0'].includes(event.key)) { event.preventDefault(); if (event.key === '0') { fit = true; zoom(); } else setZoom(event.key === '-' ? scale / 1.25 : scale * 1.25); }
 };
 own(()=>{generation++;image=undefined;viewport.onkeydown=null;stage.replaceChildren();});shared.update();zoom(); if (active()) void reload();
 return { reload };
}
const controller=mountImagePreview(sdk.host.editor,sdk.api,sdk.host);sdk.provide("imagePreview",controller);return controller;
}
