import {PRESETS} from '../presets.js';
import {dragPayload,PRESET_DRAG_TYPE} from './bindings.js';

// Works-grid-style preset gallery (Lusion tile language): swatch, name, tags.
// Tiles are drag-out sources (HTML5 drag to the canvas places a body) and
// click targets (apply the preset to the banner — the generator regen follows
// from the banner subscription).

export function galleryItems(presets=PRESETS){
 return Object.entries(presets).map(([name,p])=>({
  name,label:p.label,color:p.color,material:p.material,behavior:p.behavior,
 }));
}

export function createGallery({kit,doc=document,onDragOut}={}){
 const root=doc.createElement('div');
 root.id='splash-gallery';
 root.className='splash-panel';
 root.setAttribute('aria-label','Preset gallery');
 for(const item of galleryItems(PRESETS)){
  const tile=doc.createElement('button');
  tile.type='button';
  tile.className='gallery-tile';
  tile.draggable=true;
  tile.dataset.preset=item.name;
  tile.setAttribute('aria-label',
   `${item.label}: ${item.material} material, ${item.behavior} behavior. Click to apply, drag onto the canvas to place.`);
  const swatch=doc.createElement('span');
  swatch.className='tile-swatch';
  swatch.style.background=item.color;
  swatch.setAttribute('aria-hidden','true');
  const name=doc.createElement('span');
  name.className='tile-name';
  name.textContent=item.label;
  const tags=doc.createElement('span');
  tags.className='tile-tags';
  tags.textContent=`${item.material} · ${item.behavior}`;
  tile.append(swatch,name,tags);
  tile.addEventListener('dragstart',e=>{
   // A plain-text payload keeps drags alive in engines that refuse empty
   // dataTransfer; the typed payload is what the drop handler reads.
   e.dataTransfer.setData('text/plain',item.label);
   e.dataTransfer.setData(PRESET_DRAG_TYPE,dragPayload(item.name));
   e.dataTransfer.effectAllowed='copy';
   onDragOut?.(item.name);
  });
  tile.addEventListener('click',()=>kit.banner.patch({preset:item.name}));
  root.append(tile);
 }
 return root;
}
