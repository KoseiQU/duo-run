#!/bin/bash
# deploy/ に公開用ファイルだけを集める（Netlify Drop 用）。実行: bash deploy.sh
# 作業ツリーの未コミット変更（実装中のWIP）を混ぜないため、最新コミット(HEAD)から取り出す。
cd "$(dirname "$0")"
rm -rf deploy && mkdir deploy
git archive HEAD index.html manifest.json js tests | tar -x -C deploy
echo "deploy/ を更新しました（$(git rev-parse --short HEAD)）→ https://app.netlify.com/drop にドラッグ"
