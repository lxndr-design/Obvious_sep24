import * as THREE from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/space-grotesk.json' with {type:'json'};

// Register another typeface here without changing object records or the inspector.
export const LETTER_FONTS={'space-grotesk':{label:'Space Grotesk',font:new FontLoader().parse(fontData)}};
export function validLetter(value){return !!value&&typeof value.character==='string'&&Array.from(value.character).length===1&&!!LETTER_FONTS[value.font]?.font.data.glyphs[value.character]&&value.character.trim()!=='';}
export function makeLetter(R,letter={character:'A',font:'space-grotesk'}){
 if(!validLetter(letter))throw Error('Choose one character supported by the font.');
 const shapes=LETTER_FONTS[letter.font].font.generateShapes(letter.character,1);
 const geometry=new THREE.ExtrudeGeometry(shapes,{depth:.16,bevelEnabled:false,curveSegments:6});geometry.computeBoundingBox();
 const center=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z);geometry.computeBoundingBox();
 // Concave outlines and counters remain open to dragging and collisions.
 const shape=new R.TriMesh(new Float32Array(geometry.attributes.position.array),new Uint32Array(Array.from({length:geometry.attributes.position.count},(_,i)=>i)));
 return {geometry,height:geometry.boundingBox.max.y-geometry.boundingBox.min.y,parts:[{shape,offset:new THREE.Vector3()}],letter:{...letter}};
}
