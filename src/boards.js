import * as THREE from 'three';
import {actionURL} from './message-actions.js';
export const defaultBoard=()=>({title:'A quiet moment',url:'/boards/welcome.html'});
export function makeBoard(R,board=defaultBoard()){
 const geometry=new THREE.BoxGeometry(1.6,1.1,.09);geometry.computeBoundingBox();
 return {geometry,height:1.1,parts:[{shape:new R.Cuboid(.8,.55,.045),offset:new THREE.Vector3()}],board:{...board}};
}
export function decorateBoard(o){
 if(!o.board)return;
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;const c=canvas.getContext('2d');
 c.fillStyle='#f6f5ed';c.fillRect(0,0,768,512);c.fillStyle='#303830';c.font='30px Arial';c.fillText('ETERNITY',45,65);c.font='46px Arial';
 const title=o.board.title||'Board';c.fillText(title,45,270,680);c.font='26px Arial';c.fillText('Open board ↗',45,455);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshBasicMaterial({map:texture}),scale=o.modelScale??1,geometry=new THREE.PlaneGeometry(1.5*scale,1*scale),faces=[];
 for(const side of [-1,1]){const face=new THREE.Mesh(geometry,material);face.position.z=side*.046*scale;if(side<0)face.rotation.y=Math.PI;face.raycast=()=>{};o.mesh.add(face);faces.push(face);}
 o.boardVisual={texture,material,geometry,faces};
}
export function disposeBoard(o){if(!o.boardVisual)return;const v=o.boardVisual;for(const face of v.faces)face.removeFromParent();v.texture.dispose();v.material.dispose();v.geometry.dispose();o.boardVisual=null;}
export class BoardView {
 constructor(onOpen,onClose){
  this.dialog=document.createElement('dialog');this.dialog.id='board-view';this.dialog.innerHTML='<iframe title="Board page" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe><div class="board-navigation"><span></span><a target="_blank" rel="noopener noreferrer">Open website ↗</a><button type="button" aria-label="Close board">×</button></div><p class="board-fallback">If the page cannot be embedded, use “Open website”.</p>';document.body.append(this.dialog);
  this.frame=this.dialog.querySelector('iframe');this.onOpen=onOpen;this.onClose=onClose;this.dialog.querySelector('button').onclick=()=>this.close();this.dialog.oncancel=e=>{e.preventDefault();this.close();};this.dialog.addEventListener('keydown',e=>e.stopPropagation());
 }
 get active(){return this.dialog.open;}
 open(board){const url=actionURL(board?.url);if(!url)return false;this.onOpen();this.dialog.querySelector('span').textContent=board.title||'Board';this.dialog.querySelector('a').href=url;this.frame.title=board.title||'Board page';this.frame.src=url;this.dialog.showModal();this.dialog.querySelector('button').focus();return true;}
 close(){if(!this.active)return;this.dialog.close();this.frame.src='about:blank';this.onClose();}
}
