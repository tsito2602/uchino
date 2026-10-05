export type AppConfig={environment?:string;ai?:boolean;demoImport?:boolean};

// The last answer is kept so an offline launch still knows its environment.
const environmentKey='uchino-environment';
let request:Promise<AppConfig>|null=null;

export function loadConfig():Promise<AppConfig> {
  return request??=fetch('/api/config').then(r=>r.json() as Promise<AppConfig>).then(config=>{
    try { if(config.environment)localStorage.setItem(environmentKey,config.environment);else localStorage.removeItem(environmentKey); } catch { /* Offline fallback only. */ }
    return config;
  }).catch(()=>{
    request=null;
    try { return {environment:localStorage.getItem(environmentKey)??undefined}; } catch { return {}; }
  });
}

// Demo data is a staging tool. Anywhere else (or unknown) shows real data.
export const demoDataAvailable=(config:AppConfig)=>config.environment==='staging';
