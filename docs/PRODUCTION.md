# 本番環境

| 項目 | 本番 | staging |
| --- | --- | --- |
| ブランチ | main | staging |
| Worker | uchino | uchino-staging |
| 設定ファイル | `wrangler.production.jsonc` | `wrangler.staging.jsonc` |
| D1 | uchino（`42e2808a-521b-46c3-a35e-ba1b8d95254c`） | uchino-staging |
| R2 | uchino-recipe-photos | uchino-staging-recipe-photos |
| APP_ENV | production（デモ取り込みAPIは無効） | staging |

stagingはそのまま残し、stagingブランチで確認してからmainへ統合して本番へ出します。

## Cloudflare Workers Builds

Workers & Pages → Create → Import a repository で `tsito2602/uchino` を選び、Worker名 `uchino`、本番ブランチ `main` に設定します。

- Build command: `npm run check`
- Deploy command: `npx wrangler deploy --config wrangler.production.jsonc --keep-vars`
- Root directory: `/`
- Node version: `24`

## 秘密値・変数

uchino → Settings → Variables and Secrets に設定します。値はソース・チャットに書きません。

| 名前 | 内容 |
| --- | --- |
| GOOGLE_CLIENT_ID | stagingと同じOAuthクライアントを使えます |
| GOOGLE_CLIENT_SECRET | Secret |
| SESSION_SECRET | Secret。stagingとは別の乱数（32バイト以上） |
| ALLOWED_EMAILS | 利用者のGoogleメールをカンマ区切り |

Google CloudのOAuthクライアントに本番のoriginを追加します。

- JavaScript origin: `https://<本番のURL>`
- Redirect URI: `https://<本番のURL>/api/auth/google/callback`

## stagingからのデータ移行（2026-10-04実施）

- D1: stagingのスキーマ（`migrations/0001`〜`0003`、`d1_migrations`の履歴を含む）を作成し、プロフィール・レシピ帳・メンバー・削除されていないレシピをコピーしました。削除済みの記録（買い物メモ・レシピの削除履歴）は新しい端末に不要なため移していません。両DBで全列の指紋が一致することを確認済みです。
- 保存キーはGoogleアカウントのIDから決まるため、同じGoogleアカウントでログインすれば同じレシピ帳がそのまま開きます。
- R2: 本番Workerは `LEGACY_RECIPE_PHOTOS` としてstagingのバケットを読み取り専用で参照します。本番のバケットにない写真は、最初に表示・保存したときにstagingからコピーします（`worker/recipe-photos.ts` の `adoptLegacyPhoto`）。stagingの写真は削除しません。
- 本番公開後は、stagingで追加した内容は本番に反映されません。再移行が必要な場合は本番D1の `user_data` などを入れ替える前に必ず確認します。

すべての写真が本番バケットへ移った後は、`wrangler.production.jsonc` から `LEGACY_RECIPE_PHOTOS` を外せます。

## 以後の更新

```sh
npm run db:production       # マイグレーションを追加したとき
npm run deploy:production   # 手動デプロイ（通常はWorkers Buildsが実行）
```
