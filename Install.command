#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print 'Codex/Claude Code版はNode.js 20.9以降が必要です。Claude.app版は同梱.mcpbを開くだけです。'
  read '?Enterで終了'; exit 1
fi
print 'Sarashina Editor'
print '1: Codexに導入  2: Claude Codeに導入  3: APIキーを設定'
read 'choice?番号: '
case "$choice" in
  1) node scripts/install.mjs codex ;;
  2) node scripts/install.mjs claude-code ;;
  3) node scripts/setup.mjs ;;
  *) print '変更せず終了します。' ;;
esac
read '?Enterで終了'
