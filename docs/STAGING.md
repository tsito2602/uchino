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

Googleログインと、Cloudflare AI Gatewayを通じたResponses API形式のモデルを設定後に有効化します。既存uchiwakeの認証情報やGatewayを無断で共有しません。

`wrangler.staging.jsonc` に `"ai": {"binding":"AI"}` を追加し、次の変数を設定します。

| 変数 | 内容 |
| --- | --- |
| AI_GATEWAY_ID | uchino用に作成したGateway ID |
| AI_RECIPE_MODEL | 接続・課金設定を確認したモデルID。uchiwakeの抽出処理と同じ形式なら `openai/gpt-6-luna` |

初期版はレシピの抽出を1回で行い、必ず編集画面で確認して保存します。Jev分類は未接続です。設定済みモデルを使った実リクエストの確認は別途必要です。URL取り込みはAIを使わず対応サイトのJSON-LDを読みます。取得できないページでは本文や画像を案内します。

## 公開後の確認

1. `/api/health` が `{ok:true, app:"uchino", environment:"staging"}` を返す。
2. ログイン画面→この端末で使う→レシピ追加→再読み込みで保持される。
3. 2人分→4人分で分量が2倍になり、選択材料を買い物へ追加できる。
4. ライト・ダーク、390px/360px幅、ボトムナビ・フォームを確認。
5. ホーム画面へ追加したPWAで、読み込み後にオフライン表示を確認。
6. Google設定後は許可アカウントでログインし、別アカウントとのデータ分離・同期を確認。

単体テストでは認証・分離・競合・入力検証をテスト用セッションとSQLiteで確認します。実Googleログイン・実Cloudflare D1・AIの接続テストの代替にはしません。
