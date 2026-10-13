# 導入・更新・削除

MacのCodex / ChatGPTアプリには[README](../README.md)のGUIセットアップを推奨します。以下はCLIや追加設定を使う場合の手順です。

## Codex CLI / Claude Code

Node.js 20.9以降と対象CLIのpluginコマンドが必要です。ソース配布ZIPを保存先へ展開し、導入後もそのフォルダを保持してください。macOSでは `Install.command` を開いて対象を選択できます。

ターミナルで導入する場合は、展開先で実行します。

```sh
node scripts/install.mjs codex
# Claude Codeの場合はこちら
node scripts/install.mjs claude-code
node scripts/setup.mjs
```

主設定をバックアップしてから公式CLIで登録します。Codex向けにはNodeとサーバーの絶対パスを書き込みます。展開フォルダやNodeを移動した場合は再導入してください。Codexにプラグインの元フォルダを登録するだけでは起動パスの設定が不足するため、上のスクリプトを使ってください。

## 共通設定

GUI / CLI版のキーは `~/.config/sarashina-editor/config.json` に保存します。キーを会話やGitに貼り付けないでください。環境変数 `SARASHINA_API_KEY` があればファイルより優先します。

既定モデルは `sarashina3-mini` です。`SARASHINA_MODEL` または設定JSONの `model` に `sarashina3-nano` を指定することもできます。自動切替は行いません。設定ファイルの場所は `SARASHINA_CONFIG_FILE` で変更できます。

## 更新

GUI版は最新版のセットアップを開いて再登録します。キーを空欄にすれば既存値を保持します。登録後はホストアプリを完全終了して起動し直してください。

CLI版は新しいZIPを保存先へ展開し、同じインストーラーを実行します。古いマーケットプレイスとの重複を指摘された場合は、対象のマーケットプレイスだけを削除してから登録します。他の設定や認証情報を削除する必要はありません。

## 無効化・削除

CodexアプリではPluginsのInstalledからSarashina Editorを無効化または削除します。CLIで導入した場合は次のコマンドを使えます。

```sh
codex plugin remove sarashina-editor@sarashina-editor-local
```

GUI版の既定IDは `sarashina-editor@sarashina-editor-personal` です。既存の個人用カタログに導入した場合、末尾はそのカタログ名になります。CLI版のIDと取り違えないでください。

Claude Codeでは `/plugin uninstall sarashina-editor@sarashina-editor-local`、Claude.appでは拡張機能の設定からアンインストールします。

共通設定ファイルのキーは残ります。不要になった場合のみ、本拡張専用の `~/.config/sarashina-editor/config.json` を削除してください。GUI版がコピーした `~/.codex/plugins/sarashina-editor` も、利用を停止してから削除できます。個人カタログを手動編集する場合は本拡張の項目だけを対象にし、ファイル全体を削除しないでください。
