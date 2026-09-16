// Damped 2D wave equation, fixed 120 Hz timestep, reflecting (Neumann) walls.
// CFL: c * dt / dx < 1/sqrt(2). No frame-dependent animation of the water.
export class WaveField {
  constructor(size=97,width=5){this.size=size;this.width=width;this.dx=width/(size-1);this.dt=1/120;this.speed=2.25;this.damping=0.52;this.height=new Float32Array(size*size);this.velocity=new Float32Array(size*size);this.next=new Float32Array(size*size);this.accumulator=0;this.time=0;this.windClock=0;this.energy=.35;}
  disturb(u,v,strength=.8,radius=.19){const n=this.size;for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++){const d=((x/(n-1)-u)*this.width)**2+((z/(n-1)-v)*this.width)**2;if(d<radius*radius*9)this.velocity[z*n+x]+=strength*Math.exp(-d/(2*radius*radius));}}
  step(delta){this.accumulator+=Math.min(delta,.05);while(this.accumulator>=this.dt){this.integrate();this.accumulator-=this.dt;}}
  integrate(){const n=this.size,h=this.height,v=this.velocity,dt=this.dt,k=this.speed**2/this.dx**2;this.time+=dt;this.windClock+=dt;
    if(this.windClock>.27){this.windClock=0;if(this.energy>0)this.disturb(.12+.03*Math.sin(this.time),.5+.36*Math.sin(this.time*1.7),this.energy*.62,.24);}
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){const i=z*n+x;const left=z*n+Math.max(0,x-1),right=z*n+Math.min(n-1,x+1),up=Math.max(0,z-1)*n+x,down=Math.min(n-1,z+1)*n+x;v[i]=(v[i]+k*(h[left]+h[right]+h[up]+h[down]-4*h[i])*dt)*Math.exp(-this.damping*dt);this.next[i]=h[i]+v[i]*dt;}
    // Remove accumulated DC offset; an impulse moves water rather than adding volume.
    let mean=0;for(const y of this.next)mean+=y;mean/=this.next.length;for(let i=0;i<h.length;i++)h[i]=this.next[i]-mean;
  }
  reset(){this.height.fill(0);this.velocity.fill(0);this.next.fill(0);this.time=0;this.windClock=0;this.accumulator=0;}
}
