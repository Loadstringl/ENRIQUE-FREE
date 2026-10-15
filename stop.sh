#!/bin/bash
cd "$(dirname "$0")" || exit 1
if [ -f bot.pid ] && kill -0 "$(cat bot.pid)" 2>/dev/null; then
	kill "$(cat bot.pid)" && rm -f bot.pid && echo "已停止"
else
	echo "未在运行"
fi
