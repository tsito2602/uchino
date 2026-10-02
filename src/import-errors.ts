export type ImportDiagnostics={
  code:string;
  stage:'request'|'response'|'decode'|'output';
  httpStatus:number|null;
  providerCode:string;
  providerStatus?:string;
  reason?:'schema_rejected'|'video_unavailable'|'unsupported_video'|'invalid_payload';
  field?:string;
  provider?:string;
  model?:string;
};

export class ImportFailure extends Error {
  constructor(message:string,public diagnostics?:ImportDiagnostics){super(message);}
}
