const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));
// Folding changes the silhouette; the flight stroke is a separate shoulder motion.
const CLOSED=[.045,.016,0,-.125,-.005,.006,-.14,.022,.010,-.005,.043,.008];
const OPEN=[.045,0,0,-.085,0,.055,-.10,.006,.21,.035,.004,.16];
export function setBirdWings(view,spread,stroke=0){
 spread=clamp(spread);
 for(let i=0;i<view.wings.length;i++){
  const wing=view.wings[i],sign=i===0?1:-1,a=wing.geometry.attributes.position;
  for(let v=0;v<4;v++){const j=v*3;a.setXYZ(v,CLOSED[j]+(OPEN[j]-CLOSED[j])*spread,CLOSED[j+1]+(OPEN[j+1]-CLOSED[j+1])*spread,sign*(CLOSED[j+2]+(OPEN[j+2]-CLOSED[j+2])*spread));}
  a.needsUpdate=true;wing.geometry.computeVertexNormals();wing.geometry.computeBoundingSphere();wing.geometry.computeBoundingBox();
  wing.rotation.x=-sign*stroke;
 }
}
export function animateBirdWings(bird,dt){
 let state='closed',amplitude=0,rate=34;
 if(bird.state==='arriving'){
  // Briefly glide with spread wings before folding on touchdown.
  state=bird.age<2.45?'flapping':'open';amplitude=state==='flapping'?1.12:0;
 }else if(bird.state==='departing'){state='flapping';amplitude=1.2;rate=38;}
 else if(bird.state==='hopping')state='open';
 else if(bird.state==='bathing'&&(bird.age%1.6)/1.6<.65){state='flapping';amplitude=1.25;rate=42;}
 const ease=1-Math.exp(-24*Math.max(0,dt)),target=state==='closed'?0:1;
 bird.wingState=state;bird.wingSpread=(bird.wingSpread??target)+(target-(bird.wingSpread??target))*ease;
 bird.wingFlap=(bird.wingFlap??0)+(amplitude-(bird.wingFlap??0))*ease;
 if(Math.abs(bird.wingSpread-target)<.001)bird.wingSpread=target;
 if(bird.wingFlap<.001&&amplitude===0)bird.wingFlap=0;
 bird.wingPhase=((bird.wingPhase??0)+rate*Math.max(0,dt))%TAU;
 bird.wing=Math.sin(bird.wingPhase)*bird.wingFlap*bird.wingSpread;
}
