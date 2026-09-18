import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WaterRefraction,refractiveWaterMaterial} from '../src/water-refraction.js';
function fixture(){
 const capture=new WaterRefraction(),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,100);
 const original=new THREE.MeshPhongMaterial({transparent:true,opacity:.48}),surface=refractiveWaterMaterial(original),a=new THREE.Mesh(new THREE.PlaneGeometry(),surface),b=new THREE.Mesh(new THREE.PlaneGeometry(),surface),solid=new THREE.Mesh(new THREE.BoxGeometry());scene.add(a,b,solid);
 let target={name:'composer'},calls=0;const previous=target;
 const renderer={getDrawingBufferSize:v=>v.set(1400,900),getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},clear(){},render(){calls++;assert.equal(a.visible,false);assert.equal(b.visible,false);assert.equal(solid.visible,true);}};
 return {capture,scene,camera,original,surface,a,b,renderer,previous,target:()=>target,calls:()=>calls};
}
test('all basins share one color/depth capture, preserve the renderer target, and leave spray material alone',()=>{
 const f=fixture();f.capture.resize(800,600);assert.ok(f.capture.render(f.renderer,f.scene,f.camera,[f.a,f.b]));
 assert.equal(f.calls(),1);assert.equal(f.a.visible,true);assert.equal(f.b.visible,true);assert.equal(f.target(),f.previous);
 assert.equal(f.surface.userData.refraction.waterScene.value,f.capture.target.texture);assert.equal(f.surface.userData.refraction.waterDepth.value,f.capture.target.depthTexture);
 assert.deepEqual(f.surface.userData.refraction.waterScreen.value.toArray(),[1400,900]);assert.equal(f.surface.userData.refraction.waterReady.value,1);assert.equal(f.original.userData.refraction,undefined);assert.equal(f.original.opacity,.48);f.capture.dispose();
});
test('hidden basins skip capture and failed captures cannot leave water hidden or the wrong target bound',()=>{
 const f=fixture();f.scene.visible=false;assert.equal(f.capture.render(f.renderer,f.scene,f.camera,[f.a,f.b]),false);assert.equal(f.calls(),0);f.scene.visible=true;
 f.renderer.render=()=>{throw Error('render failed');};assert.throws(()=>f.capture.render(f.renderer,f.scene,f.camera,[f.a,f.b]),/render failed/);
 assert.equal(f.a.visible,true);assert.equal(f.b.visible,true);assert.equal(f.target(),f.previous);assert.equal(f.surface.userData.refraction.waterReady.value,0);f.capture.dispose();
});

test('drag fades preserve live refraction uniforms and the water shader across repeated captures',async()=>{
 const {DragPresentation}=await import('../src/dragging.js');
 const f=fixture(),body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),o={mesh:body};f.scene.add(body);body.add(f.a);
 const presentation=new DragPresentation(),original=f.a.material;
 presentation.animate(presentation.capture([o]),true);
 for(let frame=0;frame<30;frame++){
  presentation.step(1/60);presentation.withPresentation(()=>{
   assert.equal(f.a.material.userData.refraction,original.userData.refraction);
   assert.equal(f.a.material.onBeforeCompile,original.onBeforeCompile);
   if(f.a.material!==original){assert.equal(f.a.material.alphaHash,true);assert.equal(f.a.material.depthWrite,true);assert.equal(f.a.material.transparent,false);}
   assert.equal(f.a.material.customProgramCacheKey(),original.customProgramCacheKey());
   assert.ok(f.capture.render(f.renderer,f.scene,f.camera,[f.a,f.b]));
  });
  assert.equal(f.a.material,original);assert.equal(body.material.transparent,false);
 }
 const shader={uniforms:{},fragmentShader:THREE.ShaderLib.phong.fragmentShader};original.onBeforeCompile(shader);
 assert.equal(shader.uniforms.waterBaseOpacity.value,.48);assert.ok(shader.fragmentShader.includes('opacity/max(waterBaseOpacity,.001)'));
 f.capture.dispose();
});
