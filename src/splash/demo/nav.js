// The demo column's only navigation chrome: a fixed five-dot rail. Dots
// smooth-scroll to their section; the active dot syncs to the most-visible
// section via its own observer. DOM module — no kit or scene access.
export function createDotNav({sections,doc=document,IO}={}){
 const nav=doc.createElement('nav');
 nav.className='splash-dots';
 nav.setAttribute('aria-label','Banner sections');
 const dots=[];
 const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false;
 sections.forEach((section,i)=>{
  const name=section.querySelector('.banner-name')?.textContent??`Banner ${i+1}`;
  const dot=doc.createElement('button');
  dot.type='button';
  dot.className='splash-dot';
  dot.setAttribute('aria-label',`Go to ${name}`);
  dot.addEventListener('click',()=>{
   section.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});
  });
  nav.append(dot);
  dots.push(dot);
 });
 function setActive(index){
  dots.forEach((dot,i)=>{
   dot.classList.toggle('active',i===index);
   if(i===index)dot.setAttribute('aria-current','true');
   else dot.removeAttribute('aria-current');
  });
 }
 setActive(0);
 // Active-dot sync: the section with the largest visible ratio owns the dot.
 const Observer=IO??globalThis.IntersectionObserver;
 let observer=null;
 if(typeof Observer==='function'){
  const ratios=sections.map(()=>0);
  observer=new Observer(entries=>{
   for(const entry of entries){
    const i=sections.indexOf(entry.target);
    if(i>=0)ratios[i]=entry.isIntersecting?entry.intersectionRatio:0;
   }
   let best=0;
   for(let i=1;i<ratios.length;i++)if(ratios[i]>ratios[best])best=i;
   setActive(best);
  },{threshold:[0,.25,.5,.75,1]});
  for(const section of sections)observer.observe(section);
 }
 return{
  root:nav,
  setActive,
  dispose(){observer?.disconnect();},
 };
}
