import * as THREE from 'three';

let foliageNormal;
// One small, shared, mipmapped texture: leaf relief without extra geometry or draws.
export function hedgeNormalMap(){
 if(foliageNormal)return foliageNormal;
 const size=256,height=new Float32Array(size*size);let seed=713;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const index=(x,y)=>((y+size)%size)*size+(x+size)%size;
 for(let leaf=0;leaf<380;leaf++){
  const cx=random()*size,cy=random()*size,angle=random()*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
  const length=8+random()*10,width=length*(.35+random()*.2),rise=.35+random()*.65,r=Math.ceil(length);
  for(let y=Math.floor(cy)-r;y<=cy+r;y++)for(let x=Math.floor(cx)-r;x<=cx+r;x++){
   const dx=x-cx,dy=y-cy,u=(dx*c+dy*s)/length,v=(-dx*s+dy*c)/width;
   // Pointed oval with a raised midrib, layered over its neighbours.
   const edge=1-u*u-Math.abs(v);if(edge<=0)continue;
   const h=rise*Math.pow(edge,.7)*(1-.2*Math.abs(u));
   const i=index(x,y);height[i]=Math.max(height[i],h);
  }
 }
 const pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(height[index(x-1,y)]-height[index(x+1,y)])*3,ny=(height[index(x,y-1)]-height[index(x,y+1)])*3;
  const inv=1/Math.hypot(nx,ny,1),i=(y*size+x)*4;
  pixels[i]=Math.round((nx*inv*.5+.5)*255);pixels[i+1]=Math.round((ny*inv*.5+.5)*255);pixels[i+2]=Math.round((inv*.5+.5)*255);pixels[i+3]=255;
 }
 foliageNormal=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
 foliageNormal.name='White hedge leaf relief';foliageNormal.wrapS=foliageNormal.wrapT=THREE.RepeatWrapping;
 foliageNormal.generateMipmaps=true;foliageNormal.minFilter=THREE.LinearMipmapLinearFilter;foliageNormal.magFilter=THREE.LinearFilter;
 foliageNormal.needsUpdate=true;return foliageNormal;
}
export function applyHedgeSurface(material){material.normalMap=hedgeNormalMap();material.normalScale.set(.7,.7);return material;}

// Metre-based face projection keeps leaf size constant as tiles join and split.
export function hedgeUVs(geometry){
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  if(Math.abs(n.getY(i))>.5){uv[i*2]=x;uv[i*2+1]=z;}
  else if(Math.abs(n.getX(i))>Math.abs(n.getZ(i))){uv[i*2]=z;uv[i*2+1]=y;}
  else{uv[i*2]=x;uv[i*2+1]=y;}
 }
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));return geometry;
}
