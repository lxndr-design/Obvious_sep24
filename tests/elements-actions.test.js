import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeSizedForm} from '../src/object-size.js';
import {validLetter} from '../src/letters.js';
import {actionURL,validAction,remapActions,messageActions} from '../src/message-actions.js';
import {objectRecord,validateSpace} from '../src/spaces.js';
import {properties} from '../src/object-properties.js';
import {CollisionScene} from '../src/collision.js';
import {replaceForm} from '../src/replace-form.js';
import {SignFocus} from '../src/sign-focus.js';
await R.init();
const form=(type,size=2,options={})=>{const f=makeSizedForm(type,R,size,options),o={...f,type,id:1,mesh:new THREE.Mesh(f.geometry),properties:properties()};o.mesh.position.y=f.height/2;return o;};
test('Space Grotesk glyphs are real extrusions with open counters and exact mesh colliders',()=>{
 const o=form('letter',2,{letter:{character:'O',font:'space-grotesk'}});o.mesh.updateMatrixWorld();
 assert.equal(o.letter.character,'O');assert.equal(o.parts[0].shape.type,R.ShapeType.TriMesh);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,o.height/2,3),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(o.mesh).length,0,'O counter stays open');
 const b=o.geometry.boundingBox;ray.ray.origin.x=b.max.x*.97;assert.ok(ray.intersectObject(o.mesh).length>0);
 assert.ok(validLetter({character:'é',font:'space-grotesk'}));assert.equal(validLetter({character:'AB',font:'space-grotesk'}),false);
});
test('letter shape edits preserve IDs and messages and reject obstructed geometry atomically',()=>{
 const collision=new CollisionScene(R),letter=form('letter',1),block=form('box',1);block.mesh.position.set(.8,.5,0);collision.objects=[letter,block];letter.properties.messages=[{text:'hello',choices:[]}];
 const before=letter.geometry,position=letter.mesh.position.clone();assert.equal(replaceForm(letter,makeSizedForm('letter',R,3,{letter:{character:'W',font:'space-grotesk'}}),'letter',collision),false);assert.equal(letter.geometry,before);assert.ok(letter.mesh.position.equals(position));
 block.mesh.position.x=8;assert.equal(replaceForm(letter,makeSizedForm('letter',R,1,{letter:{character:'B',font:'space-grotesk'}}),'letter',collision),true);assert.equal(letter.id,1);assert.equal(letter.properties.messages[0].text,'hello');assert.equal(letter.mesh.geometry,letter.geometry);assert.equal(letter.letter.character,'B');
});
test('action URLs reject scripts, embedded documents and credentials; target references remap on restore',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,<script>','file:///tmp/a','https://user:secret@example.com'])assert.equal(actionURL(value),null);
 for(const value of ['https://example.com/page','/boards/welcome.html'])assert.equal(actionURL(value),value);
 assert.ok(validAction({type:'website',url:'https://example.com'}));assert.equal(validAction({type:'object',targetId:'2'}),false);
 const p={messages:[{action:{type:'board',targetId:9}},{action:{type:'object',targetId:4}}]};remapActions(p,new Map([[9,2]]));assert.equal(p.messages[0].action.targetId,2);assert.equal(p.messages[1].action.type,'none');
});
test('messageActions maps message actions for the popup renderer',()=>{
 assert.deepEqual(messageActions({text:'hi',choices:[]}),[]);
 assert.deepEqual(messageActions({action:{type:'none'}}),[]);
 assert.deepEqual(messageActions({action:{type:'website',url:'https://example.com',label:'Docs'}}),[{kind:'website',href:'https://example.com',label:'Docs',external:true}]);
 // Invalid or missing website URLs yield href:null — the renderer shows the
 // label as plain text, never an anchor with an empty href.
 assert.deepEqual(messageActions({action:{type:'website',url:'javascript:alert(1)'}}),[{kind:'website',href:null,label:'Visit website',external:true}]);
 assert.deepEqual(messageActions({action:{type:'website'}}),[{kind:'website',href:null,label:'Visit website',external:true}]);
 assert.deepEqual(messageActions({action:{type:'board',targetId:2}}),[{kind:'board',targetId:2,label:'Open board',disabled:false}]);
 assert.deepEqual(messageActions({action:{type:'object'}}),[{kind:'object',targetId:null,label:'Take a closer look',disabled:true}]);
 // An empty label falls back to the action's default.
 assert.deepEqual(messageActions({action:{type:'object',targetId:5,label:''}}),[{kind:'object',targetId:5,label:'Take a closer look',disabled:false}]);
 assert.deepEqual(messageActions({action:{type:'website',url:'https://example.com',label:''}}),[{kind:'website',href:'https://example.com',label:'Visit website',external:true}]);
});
test('spaces retain character, font, board page and hover action fields',()=>{
 const letter=form('letter',2,{letter:{character:'G',font:'space-grotesk'}}),board=form('board');board.id=2;letter.properties.messages=[{text:'Read more',choices:[],action:{type:'board',targetId:2,label:'Open'}}];
 const value={version:1,objects:[objectRecord(letter),objectRecord(board)],camera:{position:[5,8,5],target:[0,0,0],zoom:1}};
 const read=validateSpace(JSON.parse(JSON.stringify(value)),new Set(['letter','board']));assert.deepEqual(read.objects[0].letter,letter.letter);assert.equal(read.objects[1].board.url,'/boards/welcome.html');assert.equal(read.objects[0].properties.messages[0].action.targetId,2);
 read.objects[1].board.url='javascript:alert(1)';assert.throws(()=>validateSpace(read,new Set(['letter','board'])));
});
test('focused public views restore the original camera and keep public controls locked',()=>{
 const camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,100);camera.position.set(8,10,8);camera.lookAt(0,0,0);const controls={enabled:false,target:new THREE.Vector3()},focus=new SignFocus(camera,controls),saved=camera.position.clone(),o=form('letter');
 focus.enter(o,[o],1200,800,{front:false});focus.step(1);assert.ok(focus.active);assert.equal(controls.enabled,false);focus.exit();focus.step(1);assert.equal(focus.active,false);assert.equal(controls.enabled,false);assert.ok(camera.position.equals(saved));
});
