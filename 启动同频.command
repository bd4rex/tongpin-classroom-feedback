#!/bin/zsh
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo '请先安装 Node.js 24，再重新打开本文件。'
  read -r 'tongpin_reply?按回车退出'
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
if [ ! -f dist/index.html ]; then npm run build; fi
echo '教师工作台：http://127.0.0.1:3210'
echo '保持这个窗口打开，按 Control+C 停止服务。'
if [ -f .env ]; then
  node --env-file=.env server/index.js
else
  npm start
fi
