# staging

## 作成対象

| 項目 | 設定 |
| --- | --- |
| リポジトリ | tsito2602/uchino |
| ブランチ | staging |
| Worker | uchino-staging |
| D1 | uchino-staging（初期作成スクリプトが専用DBを解決） |
| 配信 | Workers.dev / Reactを埋め込んだHono Worker |
| 環境 | APP_ENV=staging |

`wrangler.staging.jsonc` に本番環境は定義していません。R2は使用しません。AI読み取り用の元画像はサーバーには保管しません。別途登録する料理写真は端末で256KB以下のJPEGに変換し、レシピJSONの一部としてIndexedDB・D1に保存します。レシピJSONは1,800,000バイト以内、同期リクエストは1,810,000バイト以内に制限し、D1の行サイズ上限2,000,000バイトに余裕を持たせています。

## Cloudflare Workers Builds

GitHubの `tsito2602/uchino` を選び、Worker名を `uchino-staging`、ブランチを `staging` に設定します。

- Build command: `npm run check`
- Deploy command: `npx wrangler deploy --config wrangler.staging.jsonc --keep-vars`
- Root directory: `/`
- Node version: `24`

初回D1作成は認証済みCLIで `npm run setup:staging` を実行し、設定のDB IDをコミットします。D1マイグレーションは `npm run db:staging` で適用します。DB作成・マイグレーションを完了する前にGoogleログインを有効化しないでください。

DBなしで画面だけ確認する場合は `npm run deploy:staging` で公開できます。この状態では端末モードが使え、認証が未設定ならGoogleログインボタンは無効です。

## Google認証

Google CloudのOAuthクライアント（Web）で、実際に公開されたoriginを登録します。

- JavaScript origin: `https://<実際のWorker URL>`
- Redirect URI: `https://<実際のWorker URL>/api/auth/google/callback`

Cloudflareのuchino-stagingに次を設定します。秘密値はソース・チャット・ビルドログに書きません。

| 名前 | 種別・用途 |
| --- | --- |
| GOOGLE_CLIENT_ID | OAuthクライアントID |
| GOOGLE_CLIENT_SECRET | Secret |
| SESSION_SECRET | Secret。暗号学的乱数で32バイト以上 |
| ALLOWED_EMAILS | 利用者のGoogleメールをカンマ区切りで設定 |

セッションはSecure / HttpOnly / SameSite=Lax cookie、issuerはuchino、audienceは公開originです。OAuthのstate・nonce・PKCEを検証し、verified emailの許可リストを適用します。

## AI取り込み

uchiwakeと同じ接続方式・モデルを使い、Cloudflare AI Gatewayはuchino専用の `uchino` に接続します。モデルと推論設定はuchiwake main `37c7e8d9bd5651409c421c7b79639b176ff8a66d` の `wrangler.staging.jsonc`・`docs/AI_IMPORT.md` を確認して揃えました。

`wrangler.staging.jsonc` にAIバインディングと次の変数を設定済みです。デプロイで反映します。Cloudflareのuchino-staging → Settings → Variables and Secretsでも同じ値を確認できます。どちらも通常のテキスト変数です。

| 変数 | 内容 |
| --- | --- |
| AI_IMPORT_PROVIDER | `cloudflare` |
| AI_GATEWAY_ID | `uchino` |

通常のURL・画像・本文の取り込みはコード内で `openai/gpt-6-luna` に固定し、推論設定はuchiwakeと同じ `reasoning.effort: low` を使用します。`AI_RECIPE_MODEL` の追加設定は不要です。`store:false`、Gatewayのキャッシュ・ログ収集無効もuchiwakeに合わせています。YouTube動画は後述のGemini経路を使用します。

画像・本文の取り込みはResponses APIでレシピを抽出します。URL取り込みは対応サイトのJSON-LDを優先して読み、その情報をAIで材料名・分量・単位に整理します。JSON-LDがないページは表示本文から抽出します。元URLと抽出元の情報は確認画面に保持します。AI未設定時もJSON-LDの取り込みは使えますが、材料の分量は確認・分離が必要です。取得できないページでは本文や画像を案内します。

AIへの入力はuchiwakeと同じ `text.format.type: json_schema`・`strict: true` で出力項目と型を指定し、JSON出力の指示も `input` 内に含めます。元資料にない材料・分量・手順の創作を避けるよう指示し、レシピではない資料は `recipe: null` として扱います。読み取り後は必ず内容を確認して保存します。中断・読み取り途中・形式不正の結果は保存候補にしません。Jev分類は未接続です。

作成済みのAI Gateway `uchino` と同じCloudflareアカウントのWorkerにデプロイしてください。Unified Billingのクレジット残高はアカウント単位で共用し、Gatewayの設定・利用状況はuchiwakeと分けて管理します。Unified Billingで利用するため、Workerへの `OPENAI_API_KEY` の追加は不要です。Gateway側のモデル利用設定と残高を確認してください。設定名が揃っていても、モデルの実通信成功までは保証しません。

設定後は許可Googleアカウントで実データ側を開き、本文・画像・対応サイトのURLを各1件取り込んで、材料名・分量・単位と元資料を照合してください。最後に確認して保存し、再読み込み後にもレシピが残ることを確認します。デモ取り込みはAIに接続しないため、この確認の代わりにはなりません。

AI接続に失敗した場合は、取り込み画面の「エラーの詳細」で失敗工程・HTTPステータス・プロバイダーのエラーコードを確認できます。同じ診断情報をWorkerログの `recipe_import_failed` に記録します。元の本文・画像・AIサービスのエラーメッセージは診断に含めません。AIバインディングの返答はJSONオブジェクト、Response、JSONのReadableStreamに対応します。

## 公開後の確認

YouTubeの取り込みには`gemini-3.8-flash`を使用します。`env.AI.gateway('uchino').run()`で`provider: google-ai-studio`、`endpoint: v1beta/models/gemini-3.8-flash:generateContent`を明示し、`fileData.fileUri`と`responseJsonSchema`をGoogleのネイティブAPIへ渡します。既存のAIバインディングと`AI_GATEWAY_ID=uchino`、Unified Billingを共用し、キャッシュとログ収集を無効にします。通常のURL・画像・本文は引き続き`env.AI.run()`でLunaを使います。YouTube Data APIキーやGemini APIキー、追加のGatewayは不要です。Geminiの動画URL対応は公開動画のみのプレビュー機能です。

動画の手順はGeminiから`{text,startSeconds,photoSeconds}`の組で受け取り、本文と時刻を別配列で推測・補完しません。保存時は従来の`steps`と`stepVideoSeconds`へ同じ要素から変換し、不明時刻の位置も保持します。時刻が巻き戻る・動画長を超える場合は未設定にします。既存レシピの時刻は自動でずらさず、新しい取り込みから適用します。

工程画像はプレイヤー情報に掲載された公開ストーリーボードを使います。対象動画の`i.ytimg.com/sb/<videoId>/`、160px以上の対応形式だけを読み、Geminiが選んだ写真時刻に近いコマをその手順の時間範囲内で切り出します。プレビューは数秒間隔のため、指定秒ぴったりの高解像度スクリーンショットではありません。元のコマの縦横比を保ち、編集画面・詳細に通常の手順写真として保存します。同じシートは一度だけ取得し、端末で各コマをJPEG化して既存の写真容量制限内に収めます。取得は最大16シート・15秒・応答の画像データ合計800万文字まで。シートの実寸と座標が合わない場合、画像を取得できない場合、時刻が不明・手順範囲外の場合は写真を付けず、本文と動画リンクを残します。新しいキーやバインディングは不要です。失敗時は「0 / 全件」または取得できた件数を表示し、「手順画像の取得状況」と`youtube_step_photos_failed`ログに手順番号・失敗分類・HTTPステータスを残します。画像情報なし・時刻不明・時間範囲外・HTTP拒否・画像形式不正・切り出し失敗を区別し、URL・署名・応答本文は表示も記録もしません。読み取りの進捗文言は1か所に表示し、画像取得中は「手順の場面画像を取得しています」に切り替えます。

動画の`400 / 7003`はCloudflareの汎用エラーで、コードだけでは原因を特定できません。モデル共通の推論経路で拒否された実例を受け、動画のみ上記のプロバイダー指定経路へ変更しています。エラー詳細にはモデル・プロバイダー、Googleの許可済みステータス、出力形式／動画取得／入力項目の分類を追加します。上流のメッセージや動画URL・本文・認証情報は返しません。認証・利用枠・入力拒否を自動再試行しません。

検証には`npm run check`と`scripts/test-import-youtube-browser.mjs`を使用します。テストはGeminiと公開ページ取得をモックし、呼び出し形式・概要欄あり／なし・不明分量・キャンセル・時刻リンク・確認から保存と再読み込みまでを確認します。実接続の確認には、認証済みの公開アプリでYouTubeの料理動画URLを読み込んでください。

概要欄は公開視聴ページのスクリプトをストリーム解析し、対象動画IDに一致する概要欄とプレイヤーの画像情報を別々に収集・結合します。概要欄が先に出た場合は画像情報のために最大2.5秒だけ読み進め、両方そろえば取得を終えます。画像情報が後続しなくても、取得済みの概要欄は保持します。おすすめ一覧などの末尾を待たず、ページ全体は4MB・個別スクリプトは200万文字・取得は10秒で制限します。`videoDetails.shortDescription`、同じプレイヤーの`microformat`に加え、`ytInitialData`のページ表示用データも読みます。従来のJavaScript代入と、`yt-initial-data` / `yt-initial-player-response`のJSONスクリプトに対応します。ページ表示用データは`currentVideoEndpoint`の動画IDを照合し、主動画の説明または概要欄パネルだけを使います。おすすめ動画・コメント・短縮されたmeta descriptionは使いません。公開ページの拒否・同意画面への移動・取得制限では動画解析を続け、概要欄未取得の案内を残します。「概要欄の取得状況」とWorkerログの`youtube_metadata_failed`でHTTP・リダイレクト・タイムアウト・データ欠落・サイズ上限を区別できます。記録は分類・HTTPステータス・受信バイト数・データの有無のみで、元の概要欄・URL・上流エラー本文は含めません。Cloudflareからの公開ページ取得をYouTube側が拒否する場合、この解析対応だけでは解消しません。

1. `/api/health` が `{ok:true, app:"uchino", environment:"staging"}` を返す。
2. ログイン画面→この端末で使う→レシピ追加→再読み込みで保持される。
3. 2人分→4人分で分量が2倍になり、選択材料を買い物へ追加できる。
4. ライト・ダーク、390px/360px幅、ボトムナビ・フォームを確認。
5. ホーム画面へ追加したPWAで、読み込み後にオフライン表示を確認。
6. Google設定後は許可アカウントでログインし、別アカウントとのデータ分離・同期を確認。

単体テストでは認証・分離・競合・入力検証をテスト用セッションとSQLiteで確認します。実Googleログイン・実Cloudflare D1・AIの接続テストの代替にはしません。
