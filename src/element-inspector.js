import {LETTER_FONTS} from './letters.js';
export class ElementInspector {
 constructor(root,onChange,onOpen){
  this.root=document.createElement('div');this.root.className='element-properties';this.root.hidden=true;
  this.root.innerHTML='<div id="letter-settings"><label for="letter-character">Letter</label><input id="letter-character" maxlength="2"><label for="letter-font">Font</label><select id="letter-font"></select></div><div id="board-settings"><label for="board-title">Board title</label><input id="board-title" maxlength="80"><label for="board-url">Page URL</label><input id="board-url" placeholder="https://… or /boards/page.html" maxlength="2048"><button type="button" id="board-open">Open board</button></div>';root.append(this.root);
  for(const [id,{label}]of Object.entries(LETTER_FONTS))this.root.querySelector('#letter-font').add(new Option(label,id));
  for(const id of ['letter-character','letter-font','board-title','board-url']){const input=this.root.querySelector('#'+id);input.addEventListener(id==='letter-character'||id==='board-title'?'input':'change',()=>{if(this.object&&(id!=='letter-character'||input.value.trim()))onChange(this.object,id,input.value);});}
  this.root.querySelector('#board-open').onclick=()=>onOpen(this.object);
 }
 select(o){this.object=o;this.root.hidden=!o?.letter&&!o?.board;if(this.root.hidden)return;this.root.querySelector('#letter-settings').hidden=!o.letter;this.root.querySelector('#board-settings').hidden=!o.board;
  for(const [id,value]of Object.entries(o.letter?{'letter-character':o.letter.character,'letter-font':o.letter.font}:{'board-title':o.board.title,'board-url':o.board.url})){const input=this.root.querySelector('#'+id);input.value=value;input.disabled=!!o.properties.locked;}
 }
}
