// Requires sharp. Regenerate checked-in SVG/PNG assets with: node scripts/build-icons.mjs
// The approved silhouette remains the source; center its visible bounds before adding the white edge.
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const source=await readFile('assets/brand-shape.svg','utf8');
const paths=source.match(/<path[^>]+\/>/g).join('');
const {data,info}=await sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=0,bottom=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>127){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
const scale=700/(bottom-top+1);
const transform=`translate(512 512) scale(${scale}) translate(${-(left+right+1)/2} ${-(top+bottom+1)/2})`;
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="${transform}">${body}</g></svg>\n`;
const logo=svg(`<g fill="#000000">${paths}</g>`);
// Match uchiwake's visible ~4px white edge at 180px. Keep the surrounding canvas transparent.
const icon=svg(`<g fill="#ffffff" stroke="#ffffff" stroke-width="${46/scale}" stroke-linejoin="round">${paths}</g><g fill="#000000">${paths}</g>`);
await writeFile('public/logo.svg',logo);
await writeFile('public/icon.svg',icon);
for(const [name,size] of [['apple-touch-icon-v3',180],['icon-v3-192',192],['icon-v3-512',512],['icon-192',192],['icon-512',512]]){
 await sharp(Buffer.from(icon),{density:384}).resize(size,size).png({compressionLevel:9,palette:false}).toFile(`public/${name}.png`);
}
console.log('Centered icon and transparent white outline generated.');
