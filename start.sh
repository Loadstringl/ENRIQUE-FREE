#!/bin/bash
# 启动 ENRIQUE BOT（后台常驻，cron 安全）
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
cd "$(dirname "$0")" || exit 1
if [ -f bot.pid ] && kill -0 "$(cat bot.pid)" 2>/dev/null; then
	exit 0
fi
setsid /usr/local/bin/node index.js >> bot.log 2>&1 < /dev/null &
echo $! > bot.pid
