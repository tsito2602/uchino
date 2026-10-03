// Domain-independent checks shared by page, image and redirect requests.
// Production uses Workers' global fetch (public Internet egress), never a
// private-network binding. Do not replace it with a private proxy or resolver.
export function publicWebUrl(value:string,base?:URL):URL {
  let url:URL;
  try{url=new URL(value,base);}catch{throw new Error('レシピのページURLを確認してください。');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  const labels=host.split('.');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port
    ||labels.length<2||!/[a-z]/.test(labels.at(-1)!)
    ||labels.some(label=>!/^([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/.test(label))
    ||/(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/.test(host)
    ||host==='home.arpa'||host.endsWith('.home.arpa'))throw new Error('公開されているHTTP・HTTPSのレシピページURLを入力してください。');
  url.hostname=host;url.hash='';return url;
}
