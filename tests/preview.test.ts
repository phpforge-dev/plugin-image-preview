import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {activate} from '../src/preview';
import {fittedScale} from '../src/zoom';
function harness(path:string,text=''){
 const dom=new JSDOM('<div id="navigation"></div><div id="editor"></div>',{url:'https://ide.test'});const win=dom.window;
 for(const key of ['document','DOMParser','XMLSerializer','localStorage','KeyboardEvent'])globalThis[key]=win[key];
 const pending:any[]=[];globalThis.Image=class {constructor(){const img=win.document.createElement('img');Object.defineProperties(img,{naturalWidth:{value:80},naturalHeight:{value:40}});pending.push(img);return img;}} as any;
 let disconnected=false;globalThis.ResizeObserver=class{observe(){} disconnect(){disconnected=true;}} as any;
 const clean:any[]=[], listeners=new Map<string,Set<Function>>();let version=1;
 const model={uri:{toString:()=>path},getVersionId:()=>version,getValue:()=>text,isDisposed:()=>false};
 const editor={getModel:()=>model,focus(){},layout(){},onDidChangeModel:(fn:Function)=>on('model',fn),onDidChangeModelContent:(fn:Function)=>on('content',fn)};
 function on(event:string,fn:Function){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(fn);return {dispose:()=>listeners.get(event)!.delete(fn)};}
 const host=win.document.getElementById('editor')!,container=win.document.createElement('div');host.replaceWith(container);container.append(host);const owners:any[]=[];
 const update=()=>{const current=owners.find(o=>o.active());host.hidden=current?.mode()==='preview';for(const o of owners){o.preview.hidden=o!==current||o.mode()==='editor';o.toolbar.hidden=o!==current;}};
 const layout={update,register(o:any){owners.push(o);container.append(o.preview);update();return ()=>{owners.splice(owners.indexOf(o),1);o.preview.remove();o.toolbar.remove();update();};}};
 let resolveRead:any;const read=()=>new Promise<string>(resolve=>resolveRead=resolve);
 const sdk={tr:(s:string)=>s,host:{editor,path:()=>path},api:{readImage:read},editorPreviewLayout:()=>layout,own:(c:any)=>clean.push(c),provide(){}};
 const controller=activate(sdk);
 return {dom,controller,pending,host,resolveRead:(s:string)=>resolveRead(s),edit(value:string){text=value;version++;listeners.get('content')?.forEach(fn=>fn());},dispose(){for(const c of clean.reverse())typeof c==='function'?c():c.dispose();},get disconnected(){return disconnected;},get listenerCount(){return [...listeners.values()].reduce((n,s)=>n+s.size,0);}};
}
test('empty viewport keeps natural size instead of collapsing the image',()=>{
 assert.equal(fittedScale(1254,1254,0,0),undefined);
 assert.equal(fittedScale(16,16,400,300),8);
});
test('image loading, zoom, keyboard and disposal restore editor',async()=>{
 const h=harness('photo.png');assert.equal(h.host.hidden,true);h.resolveRead('data:image/png;base64,AA==');await Promise.resolve();const image=h.pending[0];image.onload();assert.equal(document.querySelector('#image-preview')?.getAttribute('data-state'),'ready');assert.equal(image.style.width,'80px');assert.match(document.querySelector('.image-info')!.textContent!,/80 × 40/);
 document.querySelector<HTMLButtonElement>('#image-actual')!.click();assert.equal(image.style.width,'80px');document.querySelector<HTMLElement>('.image-viewport')!.dispatchEvent(new KeyboardEvent('keydown',{key:'+'}));assert.equal(image.style.width,'100px');
 h.dispose();assert.equal(h.host.hidden,false);assert.equal(h.listenerCount,0);assert.equal(h.disconnected,true);assert.equal(document.querySelector('#image-preview'),null);image.onload();assert.equal(document.querySelector('#image-preview'),null);h.dom.window.close();
});
test('late image read cannot revive a disabled preview',async()=>{const h=harness('photo.png');h.dispose();h.resolveRead('data:image/png;base64,AA==');await Promise.resolve();assert.equal(h.pending.length,0);assert.equal(h.host.hidden,false);h.dom.window.close();});
test('fit enlarges a small logo to the viewport',async()=>{
 const h=harness('logo.png');const viewport=document.querySelector<HTMLElement>('.image-viewport')!;
 Object.defineProperty(viewport,'clientWidth',{value:480});Object.defineProperty(viewport,'clientHeight',{value:360});
 h.resolveRead('data:image/png;base64,AA==');await Promise.resolve();const image=h.pending[0];image.onload();
 assert.equal(image.style.width,'432px');h.dispose();h.dom.window.close();
});
