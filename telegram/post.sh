#!/usr/bin/env bash
# Telegram kanalga albom (2–10 rasm) + izoh yuboradi.
# Foydalanish: telegram/post.sh <post-papka>   (masalan telegram/posts/shablonlar)
# Kerak: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL (masalan @Furnipart_uz)
set -euo pipefail
dir="$1"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN topilmadi}"
chat="${TELEGRAM_CHANNEL:-@Furnipart_uz}"
caption="$(cat "$dir/caption.txt")"
mapfile -t imgs < <(grep -v '^\s*$' "$dir/images.txt")
args=(); media="["
for i in "${!imgs[@]}"; do
  args+=(-F "p$i=@${imgs[$i]}")
  [ "$i" -gt 0 ] && media+=","
  if [ "$i" -eq 0 ]; then
    media+=$(jq -nc --arg c "$caption" --arg m "attach://p$i" '{type:"photo",media:$m,caption:$c}')
  else
    media+=$(jq -nc --arg m "attach://p$i" '{type:"photo",media:$m}')
  fi
done
media+="]"
resp=$(curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup" \
  -F "chat_id=$chat" -F "media=$media" "${args[@]}")
echo "$resp" | jq -c '{ok, description, count: (.result|length?)}'
echo "$resp" | jq -e '.ok' >/dev/null
