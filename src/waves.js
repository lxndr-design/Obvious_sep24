// Displaced surface driven by a damped wave equation (120 Hz, CFL-safe).
// Impulses and wakes act on velocity; the visible mesh uses these actual heights.
export class WaveField {
 constructor(size=97,width=5){this.size=size;this.width=width;this.dx=width/(size-1);this.dt=1/120;this.speed=2.25;this.damping=.85;this.height=new Float32Array(size*size);this.velocity=new Float32Array(size*size);this.next=new Float32Array(size*size);this.accumulator=0;this.time=0;this.windClock=0;this.energy=.14;this.windDirection=35;this.windVector=null;this.mask=null;}
 disturb(u,v,strength=1.8,radius=.16){
  if(![u,v,strength,radius].every(Number.isFinite)||radius<=0)return;
  const n=this.size,sigma2=radius*radius;
  const x0=Math.max(0,Math.floor((u-3*radius/this.width)*(n-1))),x1=Math.min(n-1,Math.ceil((u+3*radius/this.width)*(n-1)));
  const z0=Math.max(0,Math.floor((v-3*radius/this.width)*(n-1))),z1=Math.min(n-1,Math.ceil((v+3*radius/this.width)*(n-1)));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const r2=((x/(n-1)-u)*this.width)**2+((z/(n-1)-v)*this.width)**2;
   // Local depression / raised ring, with approximately zero displaced volume.
   const profile=(1-r2/(2*sigma2))*Math.exp(-r2/(2*sigma2));
   const i=z*n+x;if(this.mask&&!this.mask[i])continue;this.velocity[i]=Math.max(-5,Math.min(5,this.velocity[i]+strength*profile));
  }
 }
 stroke(from,to,seconds,pressure=1){
  if(!from||!to)return;const distance=Math.hypot(to.u-from.u,to.v-from.v)*this.width;
  if(distance<1e-5||seconds<=0)return;
  const speed=Math.min(distance/Math.max(seconds,.001),7),steps=Math.min(240,Math.max(1,Math.ceil(distance/(this.dx*.65))));
  const strength=(.9+speed*.5)*distance/steps/.16*pressure;
  for(let i=1;i<=steps;i++){const t=(i-.5)/steps,u=from.u+(to.u-from.u)*t,v=from.v+(to.v-from.v)*t;if(u>=0&&u<=1&&v>=0&&v<=1)this.disturb(u,v,-strength,.115);}
 }
 step(delta){this.accumulator+=Math.min(delta,.05);while(this.accumulator+1e-10>=this.dt){this.integrate();this.accumulator-=this.dt;}}
 integrate(){
  const n=this.size,h=this.height,v=this.velocity,dt=this.dt,k=this.speed**2/this.dx**2;this.time+=dt;this.windClock+=dt;
  // Weak coherent pressure enters on the upwind side; no perpetual ripple emitters in calm air.
  if(this.windClock>.22){this.windClock=0;
   const a=this.windDirection*Math.PI/180,wx=this.windVector?.x??Math.cos(a)*this.energy,wz=this.windVector?.z??Math.sin(a)*this.energy,strength=Math.hypot(wx,wz);
   if(strength>0){const length=Math.max(strength,.0001),cross=.29*Math.sin(this.time*1.2);const u=.5-wx/length*.34-wz/length*cross,v=.5-wz/length*.34+wx/length*cross;this.disturb(u,v,strength*.7,.3);}
  }
  const damp=Math.exp(-this.damping*dt);
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){
   const i=z*n+x,left=z*n+Math.max(0,x-1),right=z*n+Math.min(n-1,x+1),up=Math.max(0,z-1)*n+x,down=Math.min(n-1,z+1)*n+x;
   if(this.mask&&!this.mask[i]){v[i]=0;this.next[i]=0;continue;}
   const sum=this.mask?(this.mask[left]?h[left]:h[i])+(this.mask[right]?h[right]:h[i])+(this.mask[up]?h[up]:h[i])+(this.mask[down]?h[down]:h[i]):h[left]+h[right]+h[up]+h[down];
   v[i]=(v[i]+k*(sum-4*h[i])*dt)*damp;
   this.next[i]=h[i]+v[i]*dt;
  }
  let mean=0,count=0;for(let i=0;i<h.length;i++)if(!this.mask||this.mask[i]){mean+=this.next[i];count++;}mean/=Math.max(1,count);for(let i=0;i<h.length;i++)h[i]=!this.mask||this.mask[i]?this.next[i]-mean:0;
 }
 reset(){this.height.fill(0);this.velocity.fill(0);this.next.fill(0);this.time=0;this.windClock=0;this.accumulator=0;}
}
