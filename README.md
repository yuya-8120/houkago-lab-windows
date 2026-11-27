# 放課後ラボ：Windows公開版

学校指定の **Azure App Service / Windows** で公開する版です。Node.js / Expressで投稿・検索・Table Storage・Blob Storage連携を実装しています。先に作成したFlask版は別フォルダー `houkago-lab` に残しています。提出・公開用にはこの **houkago-lab-windows** の中身を使用してください。

Python/FlaskのWindows版App Serviceは公式サポート対象外のため、公開用の実装方式を変更しました。配布課題画像ではFlaskは発展項目なので、Windows版をFlask実装済みとは記載しません。

## Windowsで試す

Node.js 24 LTSをインストールし、このフォルダーでPowerShellを開いて実行：

```powershell
npm ci
npm run seed
npm start
```

ブラウザーで http://localhost:3000 を開く。終了はCtrl+C。`npm run seed`は空のローカル保存先だけに見本投稿を6件追加します。見本が不要なら省略してください。まとめて起動するには `powershell -ExecutionPolicy Bypass -File .\start.ps1 -Demo` も使えます。

## 公開と提出

`AZURE公開手順.md` を参照。**まだAzure公開と実Storage接続は行っていません。** 氏名・クラス・出席番号・URLは `requirements.md` の欄へ記入します。以前のPython版の公開手順や `gunicorn` コマンドはこの版には使いません。

## 設定と保存

`.env.example` を `.env` にコピーするとローカルでもAzure接続を試せます。接続文字列、SECRET_KEYは `.env` またはApp Serviceの環境変数で設定し、GitHubへ追加しません。ローカルは `instance/` に1投稿1ファイルのJSONと画像を保存し、再起動しても残ります。AzureではTable Storageと非公開Blobを使い、画像はアプリを通して表示します。

画像はJPEG/PNG、5MB・2000万画素以下。保存時は最大1600pxのJPEGに再変換し、元画像のメタデータを引き継ぎません。Windows無料プランの環境差を抑えるため、画像処理はJimpを使用しています。WebPはこの版では対象外です。

`npm test` で投稿・複合検索・画像の保存表示・入力検証・再読込後の保持・Azure SDKアダプターを確認できます。SDKテストはモックで、Azureへの実接続確認ではありません。

ログイン、編集、削除、返信、通報、管理画面、スパム対策、ページ分割は未実装です。Tableを一覧取得する授業用の少量データ向け試作です。ローカルJSON保存はAzure本番では利用せず、起動時にAzureモードを必須チェックします。
