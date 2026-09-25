// Boot milestones for the splash preloader: a step is marked only when it
// actually finished, so the preloader reports real progress, never a timer.
export function createBootSequence(steps){
 const state=steps.map(({id,label})=>({id,label,done:false}));
 return{
  items:()=>state.map(({id,label,done})=>({id,label,done})),
  mark(id){
   const item=state.find(step=>step.id===id);
   if(!item)throw new Error(`Unknown boot milestone: ${id}`);
   item.done=true;
  },
  isComplete:()=>state.every(step=>step.done),
 };
}
