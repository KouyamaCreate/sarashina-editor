# 仕様 v0.1.0

2026-10-13

## 役割

ホスト（Codex/Claude）が意味の正確な日本語原稿と編集方針を作り、Sarashina3が表現の候補を生成する。ホストは原稿と候補を比較し、具体的指摘で再修正を依頼する。ホストの別APIキーは不要。MCPを呼んでいるホスト自身が編集者として判断する。

編集方針はsource/purpose/audience/genre/voice/claimsが必須。claimsは主張ID、内容、根拠、限定を含む。terminology/protected/conventions/avoid/style_examplesは任意。用語・保護語句は元原稿に存在する必要がある。根拠はURLが必須ではなく、確認した資料位置またはユーザー原稿であることを記す。

## MCP

stdio、公式TypeScript SDK、7ツールと1プロンプト。server instructionsにもワークフローを含め、スキルを読めないホストからも利用する。

| ツール | 挙動 |
|---|---|
| sarashina_status | キー設定有無・モデル・固定エンドポイントを返す。通信しない |
| sarashina_begin | 編集方針を検証してUUIDセッションを作成。通信しない |
| sarashina_propose | API通信。1〜2候補とハッシュ、機械検査結果を返す |
| sarashina_review | ホストが審査結果を登録。全6項目、全claimの候補内引用と理由を要求 |
| sarashina_finalize | 全検査合格・全レビュー合格の候補本文を返す。投稿/ファイル変更なし |
| sarashina_inspect | 元原稿、編集方針、候補、審査、呼び出し回数を再表示 |
| sarashina_close | セッションを破棄 |

候補の前後比較にはinspectで取得した原稿と候補全文を使う。レビューは候補IDとSHA-256に紐付ける。最終化の後は生成を拒否する。原稿を採用して終える場合はホストが本文を返し、closeする。原稿の機械検査合格を意味の証明と呼ばない。

## 機械検査

保護文字列・専門用語の出現回数、アラビア数字（全角含む）の多重集合、角括弧引用・URL・インラインコードの多重集合、禁止文字列、空本文、finish_reasonを検査する。finish_reasonがstop以外なら不合格。変更が妥当でも数字や引用表記を変える推敲は保守的に拒否する。

単位はprotectedに数値とまとめて指定する。漢数字、否定一般、式、数値と対象の対応や引用の係り先を完全に自動判定するものではない。ホストの6審査項目は事実、射程と確実性、否定と論理、専門用語、分野慣習、文体と読みやすさ。主張の脱落・追加はホストが判定する。人間や独立モデルによる検証を実装したとはみなさない。

## API

- 固定URL: `https://api.sarashina.ai/v1/chat/completions`、Bearer認証。
- model: 既定 `sarashina3-mini`。設定で `sarashina3-nano` も可能。自動切替なし。
- messages: system + 編集方針JSON。再修正時に前候補assistant + 指摘userを追加。全過去候補は送信しない。
- n: 1または2、temperature: 0.6、max_completion_tokens: 8000、stream: false。
- リダイレクト拒否、45秒のタイムアウト、MCPからの中止シグナルを伝播。
- 1セッションの生成成功は最大3回、API試行は最大6回。同一セッションの並行生成は禁止。
- このプロセス内で60秒窓のmini 6回/nano 60回を制限。別プロセスとの共有カウンターではない。提供元の制限は同一契約主体・モデル単位なので併用時には429があり得る。
- 429後は同一モデルを60秒抑止。APIがRetry-Afterを提供するとは仮定しない。自動再送なし。待機時間をホストへ返す。
- HTTP/通信/構造エラーはツールエラーで返す。キーや原稿を含む可能性がある応答エラー本文は返さない。失敗時も原稿を保持する。

## 状態と設定

セッションはプロセス内のみ。上限32、非活動2時間で次回アクセス時に削除。再起動で消える。キー設定は毎回読み直す。優先順位は環境変数 `SARASHINA_API_KEY` / `SARASHINA_MODEL` →設定JSON→モデル既定値。JSONパスは `SARASHINA_CONFIG_FILE`、未指定は `~/.config/sarashina-editor/config.json`。MCPBのキーはクライアントから環境変数で渡す。

設定セットアップは既存の無関係なJSONキーを維持し、0600の一時ファイルからrenameで更新。壊れたJSONは上書きしない。専用設定にはキーの古い複製を増やさない。アプリの導入は主設定をバックアップして公式CLIを使う。

## 配布

Claude Desktopはmanifest_version 0.3のMCPB。Codex/Claude Codeはそれぞれ互換manifestとマーケットプレイスカタログ。サーバーは単一CommonJSに依存をバンドル。実行にnpmは不要。プラグイン自体の公的ディレクトリへの公開・署名・リモートホスティングは未実施。

### macOSセットアップ v0.1.3

Apple Silicon / macOS 12以降向けのSwift/AppKitアプリ。CLI不要でNode.jsを検出し、個人カタログとAPIキーを設定する。プラグイン本体の版は0.1.0のまま。
コピー先は `~/.codex/plugins/sarashina-editor`、個人カタログは `~/.agents/plugins/marketplace.json`。source.pathは個人マーケットプレイスのルート（ホーム）からの `./.codex/plugins/sarashina-editor`。既存のname・interface・他のentriesを保持。旧カタログと旧プラグインはバックアップし、書き込み失敗時は元に戻す。同名の別パスを持つ既存プラグインがあれば上書きを拒否する。
キー空欄は既存値保持。キーJSONは0600。Nodeは20.9以降かを実行確認し、その絶対パスをMCP設定へ書く。登録時に `~/.codex/config.toml` の対象プラグインを `enabled = true` にする。既存設定をバックアップし、対象の設定だけを更新する。カタログに応じたプラグインIDを使い、別の項目は保持する。登録後のアプリ再起動は利用者が行う。アプリ本体にはad-hoc署名のみで、公証は未実施。

CodexのMCP引数では `${CLAUDE_PLUGIN_ROOT}` を使わず、導入先の `server.cjs` の絶対パスを書く。既存の同名プラグインキャッシュの起動定義もバックアップして同じ導入先へ向け、失敗時は復元する。CLIインストーラーもCodex向けの引数を解決し、Claude Code向けにはClaudeの変数を保持する。配布ZIPにはマシン固有のパスを混入させない。
ツールの検索・読み込みでも呼び出し機能が見つからなければ、ホスト単独の推敲で完了扱いにせず接続失敗を報告する。
