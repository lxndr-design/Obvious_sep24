const clamp=v=>Math.max(0,Math.min(1,v));
const rgb=hex=>hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const hex=c=>'#'+c.map(v=>Math.round(clamp(v)*255).toString(16).padStart(2,'0')).join('');
const luminance=c=>c.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);

// Approximate the white floor's exposed, tone-mapped brightness without GPU readbacks.
// Sun azimuth changes shadows, but not illumination of the horizontal ground.
function floorTone(strength){
 const x=Math.max(0,strength)*1.5;
 const linear=clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14));
 return linear<=.0031308?linear*12.92:1.055*linear**(1/2.4)-.055;
}
function readable(color,surface,ratio){
 color=rgb(hex(color));surface=rgb(hex(surface));
 if(contrast(color,surface)>=ratio)return color;
 const end=contrast([0,0,0],surface)>contrast([1,1,1],surface)?[0,0,0]:[1,1,1];
 for(let i=1;i<=100;i++){const candidate=rgb(hex(mix(color,end,i/100)));if(contrast(candidate,surface)>=ratio)return candidate;}
 return end;
}

export function sceneTheme({ink='#303030',paper='#ffffff',strength=1,dither=2}={}){
 // With dithering off, the renderer bypasses the ink/paper mapping too.
 const dark=dither>0?rgb(ink):[0,0,0],light=dither>0?rgb(paper):[1,1,1];
 const surface=mix(dark,light,floorTone(strength));
 const preferred=contrast(dark,surface)>contrast(light,surface)?dark:light;
 const foreground=readable(preferred,surface,7);
 const muted=readable(mix(surface,foreground,.65),surface,4.5);
 const hover=mix(surface,luminance(foreground)<luminance(surface)?[1,1,1]:[0,0,0],.12);
 const accent=readable(foreground,hover,4.5);
 return {
  '--surface':hex(surface),'--text':hex(foreground),'--muted':hex(muted),
  '--line':hex(mix(surface,foreground,.23)),'--hover':hex(hover),
  '--accent':hex(accent),'--on-accent':hex(readable(surface,accent,4.5)),
  '--track':hex(mix(surface,foreground,.25)),
  '--shadow':`color-mix(in srgb, ${hex(foreground)} 12%, transparent)`,
  '--backdrop':`color-mix(in srgb, ${hex(foreground)} 25%, transparent)`,
  'color-scheme':luminance(surface)>.179?'light':'dark',
 };
}

export function applySceneTheme(root,settings){
 for(const [property,value] of Object.entries(sceneTheme(settings)))root.style.setProperty(property,value);
}
