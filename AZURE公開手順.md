# Azure App Service / Windows への公開

この手順は **Node.js版** 用です。Python・Linux・gunicornの設定は使用しません。Azure Webアプリの作成完了を確認しました（Windows / Node 24 / Free F1 / Japan East）。GitHub ActionsのOIDC認証とファイル配置が成功しました。現在の公開版は追加Storageを作らず、App Service付属の保存領域を使用します。

## 1. Webアプリを作成

- サブスクリプション：学校指定のAzure for Students。
- 名前：`houkago-lab-1127`（利用できなければ別の一意な名前）。
- 公開：コード。
- ランタイム：**Node 24 LTS**。
- OS：**Windows**。
- 価格：**Free F1** を選び、確認画面が無料であることを確認。
- リージョン：契約で利用できるリージョン。作成済みWebアプリはJapan East。
- データベース自動作成は不要。Application Insightsは課題に不要なら無効。

作成直前の確認画面で、OSがWindows、ランタイムがNode、価格がFreeであることを確認します。有料プランしか使えない場合は先に料金を確認してください。

## 2. 追加Storageを作らない公開構成

利用者が従量課金のStorage作成を希望しなかったため、現在は `STORAGE_MODE` を設定しません。Azure上では `appservice` モードが自動選択され、`%HOME%/data/houkago-lab` に投稿と画像を保存します。SECRET_KEY未設定時は同じ領域の `session-key.txt` に初回だけ生成します。HOME領域が使えない場合は起動を失敗させます。ローカルキャッシュは有効にしません。

この構成で必要なのは既存Windows App ServiceとGitHub接続だけです。以下の独立Storageと環境変数は、将来利用者が追加Storageを選ぶ場合だけのオプションです。

### 任意：独立Storageを使う場合

同じリソースグループにStandard / StorageV2 / LRSのStorageアカウントを作成します。これはApp Service無料枠とは別の従量料金です。匿名Blob公開は無効のまま使用します。アプリは `HoukagoPosts` Tableと非公開コンテナ `post-images` を起動時に作成します。

Storageの「アクセスキー」で接続文字列を取得して、次のApp Service環境変数に設定します。接続文字列をGitHub・チャット・要件定義に貼り付けないでください。学校が共有キーを禁止している場合は管理ID方式への追加変更が必要です。

## 3. App Serviceの環境変数

| 名前 | 値 |
| --- | --- |
| `STORAGE_MODE` | `azure` |
| `AZURE_STORAGE_CONNECTION_STRING` | Storageの接続文字列（秘密） |
| `AZURE_TABLE_NAME` | `HoukagoPosts` |
| `AZURE_BLOB_CONTAINER` | `post-images` |
| `SECRET_KEY` | 下記で生成するランダム値（秘密・固定） |
| `COOKIE_SECURE` | `1` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~24` |
| `NODE_ENV` | `production` |

秘密鍵は手元で生成します：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Windows App Serviceは同梱 `web.config` によりIISNodeから `server.js` を起動します。コードは数値ポートに限定せず `process.env.PORT` をそのまま使用します。Linux用のスタートアップコマンドは設定しません。公開時はHTTPSのみを使用します。

## 4. GitHub Publicと自動デプロイ

このフォルダーの **中身をリポジトリ直下** に置きます。`server.js`・`package.json`・`web.config`・`.github/` が直下です。`node_modules`・`instance`・`.env` は追加しません。Flask版のファイルと混在させません。

同梱 `.github/workflows/azure.yml` はWindowsランナーのNode 24で `npm ci`・`npm test` を実行し、依存ライブラリ込みのZIPを作成してデプロイします。

OIDC接続設定：

1. 既存のユーザー割り当てマネージドID `oidc-msi-961f` を使用。クライアントID・テナントIDを控えます（値そのものはリポジトリに記録しません）。
2. マネージドIDへGitHub Actionsのフェデレーション資格情報を追加。種類はEnvironment、名前は `production`。新しいリポジトリは所有者IDとリポジトリIDを含む形式を使います。このリポジトリのSubjectは `repo:yuya-8120@282728110/houkago-lab-windows@1473974362:environment:production`、Audienceは `api://AzureADTokenExchange`。
3. App ServiceのIAMで、そのサービスプリンシパルへWebアプリスコープのWebsite Contributorを割り当てます。学校の管理権限が必要な場合は管理者に依頼します。
4. GitHubの公開ジョブはEnvironment `production` を使用。Actions Variablesへ `AZURE_DEPLOY_CONFIG` をJSON形式 `{ "clientId": "ID", "tenantId": "ID", "subscriptionId": "ID" }` で設定します。これらは秘密鍵ではなく接続先の識別子です。パスワードは使わず、OIDCトークンを実行時に取得します。
5. Actions Variablesへ `AZURE_WEBAPP_NAME` を実際のApp Serviceリソース名で設定。
6. mainへpushするか、Actionsの `Windows App Service deployment` を手動実行。

GitHub側の名前変数が空の間はテストのみ実行し、公開ジョブはスキップします。デプロイセンターの自動生成ワークフローを併用しないでください。

## 5. 公開確認

App Serviceの「既定のドメイン」をコピーし、トップが表示されることを確認します。`/health` が `status: ok`・`storage: azure` であることを確認し、個人情報のない投稿・画像を追加。App Service再起動後も残ること、StorageのTable・Blobに保存されることを確認します。`/health` だけではStorage疎通の証明になりません。

確認後 `requirements.md` の氏名欄・サイトURL・GitHub URL・未実施表記を更新し、Teamsに提出します。

## 公式資料

- https://learn.microsoft.com/azure/app-service/configure-language-nodejs
- https://learn.microsoft.com/azure/app-service/quickstart-nodejs
- https://learn.microsoft.com/azure/app-service/deploy-github-actions
- https://learn.microsoft.com/javascript/api/%40azure/data-tables/tableclient

App ServiceやStorageは作成後も利用状況に応じて制限・料金があるため、授業終了後は学校の指示に従って管理してください。

公式の不変識別子の説明：https://docs.github.com/en/actions/reference/security/oidc
App Serviceの永続ファイル領域：https://learn.microsoft.com/azure/app-service/operating-system-functionality
