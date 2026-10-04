// Small valid JPEG with optional JPEG comment segments, for bounded upload tests.
const jpeg=Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIwAf//Z','base64');
export function photoFixture(commentBytes=0){
  const comments=[];
  while(commentBytes>0){const size=Math.min(commentBytes,65533),part=Buffer.alloc(size+4,32);part[0]=255;part[1]=254;part.writeUInt16BE(size+2,2);comments.push(part);commentBytes-=size;}
  return 'data:image/jpeg;base64,'+Buffer.concat([jpeg.subarray(0,2),...comments,jpeg.subarray(2)]).toString('base64');
}
