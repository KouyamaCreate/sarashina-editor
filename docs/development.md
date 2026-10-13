# 開発・配布

Node.js 20.9以降を使用します。Mac用セットアップのビルドにはApple Silicon MacとXcode Command Line Toolsが必要です。

```sh
npm ci
npm run build
npm test
node scripts/build-setup.mjs
npm run package
```

ビルドはMCPサーバーと依存ライブラリを単一の `server.cjs` にまとめます。配布版の実行にnpmインストールは不要です。Macセットアップ、ソースZIP、Claude用MCPB、SHA256SUMSはリポジトリの親ディレクトリへ出力します。梱包にはmacOS/Linuxのzipコマンドを使います。Macアプリはad-hoc署名のみで、公証は行いません。

## 検証

`npm test` は外部APIを呼ばず、模擬応答で状態管理・検査・往復処理を検証します。

実APIへ架空の原稿を1回送るには、キー設定後に次を実行します。

```sh
node scripts/live-smoke.mjs --live
```

2候補と機械検査を表示します。意味の審査や確定は行いません。実APIの利用条件と上限が適用されます。

インストール済みプラグインがCodexから読み込めるかの確認:

```sh
node scripts/verify-codex.mjs /path/to/codex
```

公式app-serverを別プロセスで起動して7ツールを確認します。起動設定の変数を検証側で置換しないため、ホストでのパス解決の不具合を検出できます。生成APIやモデルのターンは実行しません。開発者向けの診断であり、現在開いている会話への反映確認とは別です。

## 公開前の確認

- テストとセットアップの自己テストを通す。
- APIキー、個人用設定、ログ、バックアップ、ローカルの絶対パスを含めない。
- ZIP/MCPBを展開して内容を確認し、SHA256SUMSを照合する。
- 実画面で未確認のクライアントを「動作確認済み」としない。
- 同梱ライブラリのライセンス通知を保持する。

文書は日本語で管理します。LICENSEと第三者ライセンス通知は原文を保持します。

## 依存ライブラリの監査

2026-10-13のnpm auditでは、実行用依存の指摘は0件。MCPB梱包用の開発依存には6件（高3件・低3件、依存元への集約を含む）の指摘が残っています。これらは配布サーバーにはバンドルされません。node-forgeの署名検証は本プロジェクトの梱包手順では使用しませんが、開発用依存が無警告という意味ではありません。信頼できない拡張や署名を検証する用途に梱包ツールを流用せず、修正版の公開に応じて更新してください。

- [node-forge: node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
- [tmp: tmp allows arbitrary temporary file / directory write via symbolic link `dir` parameter](https://github.com/advisories/GHSA-52f5-9888-hmc6)
- [tmp: tmp has Path Traversal via unsanitized prefix/postfix that enables directory escape](https://github.com/advisories/GHSA-ph9p-34f9-6g65)
