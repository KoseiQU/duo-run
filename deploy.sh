#!/bin/bash
# deploy/ に公開用ファイルだけを集める（Netlify Drop 用）。実行: bash deploy.sh
cd "$(dirname "$0")"
rm -rf deploy && mkdir deploy
cp index.html deploy/ && cp -R js deploy/js && cp -R tests deploy/tests
echo "deploy/ を更新しました → https://app.netlify.com/drop にドラッグ"
