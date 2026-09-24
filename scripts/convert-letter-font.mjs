// node scripts/convert-letter-font.mjs input.ttf output.json
import fs from 'node:fs';
import {TTFLoader} from 'three/addons/loaders/TTFLoader.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Provide input.ttf and output.json.');
const b=fs.readFileSync(input),font=new TTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
fs.writeFileSync(output,JSON.stringify(font));
