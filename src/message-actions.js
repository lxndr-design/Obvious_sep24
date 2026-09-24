export function actionURL(value){
 if(typeof value!=='string'||!value.trim()||value.length>2048)return null;
 try{const url=new URL(value,'https://eternity.invalid/');return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?value.trim():null;}catch{return null;}
}
export function validAction(action){
 if(!action||!['none','website','object','board'].includes(action.type))return false;
 if(action.label!==undefined&&(typeof action.label!=='string'||action.label.length>80))return false;
 if(action.type==='website')return action.url===''||!!actionURL(action.url);
 if(['object','board'].includes(action.type))return action.targetId==null||Number.isInteger(action.targetId)&&action.targetId>0;
 return true;
}
export function remapActions(properties,ids,{keepExternal=false}={}){
 for(const message of properties?.messages??[]){const a=message.action;if(!a||!['object','board'].includes(a.type))continue;const next=ids.get(a.targetId);if(next!==undefined)a.targetId=next;else if(!keepExternal)message.action={type:'none'};}
}
// Pure mapping from a message's click action to popup render descriptors.
// An invalid or missing website URL yields href:null — the renderer shows the
// label as plain text, never an anchor with an empty href.
export function messageActions(message){
 const action=message?.action;
 if(!action||action.type==='none')return [];
 if(action.type==='website')return [{kind:'website',href:actionURL(action.url),label:action.label||'Visit website',external:true}];
 if(action.type==='board'||action.type==='object')return [{kind:action.type,targetId:action.targetId??null,label:action.label||(action.type==='board'?'Open board':'Take a closer look'),disabled:action.targetId==null}];
 return [];
}
