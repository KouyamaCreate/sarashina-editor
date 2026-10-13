# 調査と設計判断

調査日: 2026-10-13。以下はこの時点の一次資料に基づく。APIドキュメントの公開本文を取得して仕様を確認した。

## 結論

共通のMCPサーバーを中核に、編集手順をスキルとserver instructionsへ入れる。配布形態はCodex/Claude Code向けプラグインとClaude Desktop向けMCPBを分ける。最後の返答をフックで機械的に置換する方式は採用しない。

| 方式 | 今回の判断 |
|---|---|
| MCP | 両ホストから同じAPI・状態管理・検査を呼べる。採用 |
| Skill | いつ呼び、何を審査し、どう修正指示を返すかをホストへ伝える。採用 |
| Plugin | スキルとMCPと導入情報をまとめる配布単位。採用 |
| MCPB | Claude通常チャットにローカルMCPとAPIキー入力UIを配布。採用 |
| Stop / PostToolUse hook | 全応答の強制改稿は用途判定・文脈審査を飛ばしやすく、API待機や失敗が全会話へ影響する。今回は不採用 |
| 代理LLMプロバイダー | Codex/Claude本体をSarashinaに置き換えると、保持したい専門編集能力を失うため不採用 |
| Sarashinaによる自己批評 | 自己評価を正確さの根拠にしない。候補生成に役割を絞る |
| rerank / embedding | 検索関連度を測るモデルを日本語の美しさや意味同一性の判定に流用しない |

## Sarashina3について確認できたこと

公式記事では、日本語データの比率を高めたトークナイザーと日本語のトークン効率の改善が説明されている。一方、この資料は、トークナイザーが文章の美しさを単独で生むことや、あらゆる文章で他モデルに勝ることを証明してはいない。日本語の自然さを重視しつつ、実際の原稿で比較して判断する。

モデルの公式紹介ではminiは非長考型の標準対話モデルで、日本語・指示追従等の評価が掲載されている。専門分野を理解できないと一般化する根拠にはしない。今回は性能の断言ではなく、主張の固定と役割分担によって誤りの影響を減らす。

参照:

- [トークナイズとトークン効率](https://www.sbintuitions.co.jp/blog/entry/2026/08/07/170000)
- [Sarashina3 mini / nanoの開発と評価](https://www.sbintuitions.co.jp/blog/entry/2026/06/30/100000)
- [公式モデル一覧](https://docs.sarashina.ai/models)
- [2026-10-13の無償ベータ提供開始](https://www.sbintuitions.co.jp/news/press/20261013_01/)

## API契約

公式Chat Completionsは `https://api.sarashina.ai/v1/chat/completions`。`sarashina3-mini` を標準にする。最大出力は `max_completion_tokens: 8000`。`n` は1〜5対応だが本実装は1〜2に制限する。system/user/assistantの会話で再修正できる。未記載のパラメーターは400になり得るため、OpenAI互換という理由だけで `max_tokens` などを送らない。

miniは6 RPM、nanoは60 RPM。制限ヘッダー・Retry-Afterは返らないと明記されている。自動再試行で待ち続けず、429と待機時間をホストへ返す。最大候補数と往復回数を制限して比較可能な範囲に収める。

参照: [導入と認証](https://docs.sarashina.ai/introduction)、[Chat Completions](https://docs.sarashina.ai/api-reference/chat-completions)、[レート制限](https://docs.sarashina.ai/rate-limits)。

## 配布契約

Codex公式資料で、stdio MCP・共通設定・プラグインへのMCP/スキル同梱・ローカルマーケットプレイスを確認。現行のportable plugin仕様もあるが、この版はサポート継続が明記された `.codex-plugin/plugin.json` の互換形式と、Claude側の `.claude-plugin/plugin.json` を同じパッケージに収録した。公的ディレクトリへの公開ではリモートMCPなど別の要件があり、今回のローカル配布をストア公開と呼ばない。

Claude通常チャットではMCPBによるローカル拡張を使用。組み込みNodeランタイム・機密のユーザー設定が利用できる。Claude Codeのプラグインと通常チャットで利用可能な部品の違いを踏まえ、サーバー自体にも編集手順を持たせた。

参照:

- [OpenAI: MCP](https://developers.openai.com/codex/mcp)
- [OpenAI: Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Claude Code: plugin manifest](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- [Anthropic: Desktop Extensions](https://www.anthropic.com/engineering/desktop-extensions)
- [MCPB manifest specification](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)

## データ利用と未決定事項

[サービス利用規約](https://sarashina.ai/terms)の第11条に学習利用と、有償プランのオプトアウトが規定されている。配布者のAPIキーを同梱せず、利用者自身がキーを入力する。サービスの利用条件は本拡張のMITライセンスとは別。

初期調査時はAPIキー未設定。その後、架空原稿の実API疎通は確認したが、継続的なレイテンシ・自然さの優位性は未確認。温度0.6、2候補、最大3往復は初期仮定であり、実測に基づく最適値ではない。語感を損なう過剰な制約になっていないかも実原稿で調整する。原稿・比較結果を使った継続的な評価は利用者がデータ提供を選んだ範囲で行う。
