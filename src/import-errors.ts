export type ImportDiagnostics={
  code:string;
  stage:'request'|'response'|'decode'|'output';
  httpStatus:number|null;
  providerCode:string;
};

export class ImportFailure extends Error {
  constructor(message:string,public diagnostics?:ImportDiagnostics){super(message);}
}
