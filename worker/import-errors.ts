import {ImportFailure,type ImportDiagnostics} from '../src/import-errors';

const messages={
  authentication:'AIに接続できませんでした。取り込みの接続設定を確認してください。',
  configuration:'AIの接続先またはモデルが見つかりません。接続設定を確認してください。',
  quota:'AIの利用枠を確認してください。残高または利用上限に達しています。',
  rate_limit:'AIのリクエストが混み合っています。少し待ってからお試しください。',
  invalid_request:'AIへのリクエストが拒否されました。エラーの詳細を確認してください。',
  invalid_response:'AIの返答を読み取れませんでした。エラーの詳細を確認してください。',
  extraction_failed:'材料・手順を読み取れませんでした。画像や本文を確認してください。',
  invalid_recipe:'読み取り結果に整理できない項目があります。もう一度お試しください。',
  incomplete:'読み取りが途中で終わりました。画像を分けるか、本文を短くしてお試しください。',
  refusal:'AIが読み取りを中断しました。レシピの画像や本文を確認してください。',
  timeout:'AIの応答が時間内に届きませんでした。もう一度お試しください。',
  upstream:'AIサービスでエラーが発生しました。エラーの詳細を確認してください。',
} as const;
const providerCodes=['insufficient_quota','rate_limit_exceeded','invalid_api_key','model_not_found','permission_denied','invalid_request_error','unsupported_parameter','unsupported_value','invalid_value','server_error','internal_server_error','overloaded_error','service_unavailable'];
type Stage=ImportDiagnostics['stage'];

export function aiFailure(code:keyof typeof messages,stage:Stage,status?:unknown,providerCode?:unknown):ImportFailure {
  // Only allowlisted names and short numeric codes leave the AI boundary; never copy messages or bodies.
  const safeCode=typeof providerCode==='string'&&providerCodes.includes(providerCode)?providerCode:
    (typeof providerCode==='number'&&Number.isInteger(providerCode)&&providerCode>=0&&providerCode<=99999||typeof providerCode==='string'&&/^\d{1,5}$/.test(providerCode))?String(providerCode):providerCode==null?'absent':'unrecognized';
  return new ImportFailure(messages[code],{code,stage,httpStatus:typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?status:null,providerCode:safeCode});
}

export function upstreamFailure(stage:Stage,status?:unknown,raw?:unknown):ImportFailure {
  const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
  const error=Array.isArray(value.error)?value.error[0]:value.error;
  const code=value.code??(error&&typeof error==='object'?(error as Record<string,unknown>).code:undefined)??(Array.isArray(value.errors)?value.errors[0]?.code:undefined);
  const httpStatus=status??value.status;
  const kind=code==='insufficient_quota'||httpStatus===402?'quota':
    code==='rate_limit_exceeded'||httpStatus===429?'rate_limit':
    code==='invalid_api_key'||code==='permission_denied'||httpStatus===401||httpStatus===403?'authentication':
    code==='model_not_found'||httpStatus===404?'configuration':
    httpStatus===400||httpStatus===422||['invalid_request_error','unsupported_parameter','unsupported_value','invalid_value'].includes(String(code))?'invalid_request':'upstream';
  return aiFailure(kind,stage,httpStatus,code);
}

export function importFailurePayload(error:unknown):{error:string;diagnostics?:ImportDiagnostics} {
  if(error instanceof ImportFailure&&error.diagnostics){
    console.error(JSON.stringify({event:'recipe_import_failed',...error.diagnostics}));
    return {error:error.message,diagnostics:error.diagnostics};
  }
  return {error:error instanceof Error?error.message:'読み取れませんでした。'};
}
