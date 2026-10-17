#!/usr/bin/env bash
# W23 media pipeline: one raw take in -> trimmed, captioned, lower-thirded 9:16 H.264 MP4 <= 16 MB,
# thumbnail, OGG/Opus voice note, SRT, and result.json. Offline except for the transcript, which W23 supplies.
#
#   pipeline.sh --in raw.webm --out-dir /data/intro/brk_mark/v3 --transcript raw.json \
#       --name "Mark Williams" --practice "Mark Williams Financial Planning" --fsp 00000 [--lang en] [--audio-only]
#
# Exit codes: 0 done | 1 rejected by check (reason on stderr, also in result.json) | 2 usage / missing tool | 3 no captions possible
# Env: FONT (fontconfig name, default "DM Sans"), TARGET_MB (default 15), MAX_MB (16), ALLOW_NO_CAPTIONS=1 (never for lead-facing media)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IN=""; OUT=""; TR=""; NAME=""; PRACTICE=""; FSP=""; LANG_CODE="en"; AUDIO_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --in) IN="$2"; shift 2;; --out-dir) OUT="$2"; shift 2;; --transcript) TR="$2"; shift 2;;
    --name) NAME="$2"; shift 2;; --practice) PRACTICE="$2"; shift 2;; --fsp) FSP="$2"; shift 2;;
    --lang) LANG_CODE="$2"; shift 2;; --audio-only) AUDIO_ONLY=1; shift;;
    *) echo "unknown option $1" >&2; exit 2;;
  esac
done
[ -n "$IN" ] && [ -n "$OUT" ] && [ -f "$IN" ] || { echo "usage: pipeline.sh --in file --out-dir dir [--transcript t.json] --name N --practice P --fsp F [--lang en] [--audio-only]" >&2; exit 2; }
for t in ffmpeg ffprobe node; do command -v "$t" >/dev/null || { echo "$t is not installed" >&2; exit 2; }; done
[[ "$LANG_CODE" =~ ^[a-z]{2,3}$ ]] || { echo "bad --lang" >&2; exit 2; }

mkdir -p "$OUT"; W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
FONT="${FONT:-DM Sans}"; TARGET_MB="${TARGET_MB:-15}"; MAX_MB="${MAX_MB:-16}"
DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$IN")"
HAS_VIDEO="$(ffprobe -v error -select_streams v -show_entries stream=codec_type -of csv=p=0 "$IN" | head -n1 || true)"
[ -z "$HAS_VIDEO" ] && AUDIO_ONLY=1

# 1. Trim leading/trailing silence (cut points from silencedetect; middle pauses stay, so audio and video stay in sync)
ffmpeg -hide_banner -nostats -i "$IN" -vn -af "silencedetect=n=-45dB:d=0.4" -f null - 2> "$W/sd.log" || true
read -r TS TE < <(node -e '
  const {silenceTrimPoints}=require(process.argv[1]);
  const p=silenceTrimPoints(require("fs").readFileSync(process.argv[2],"utf8"),parseFloat(process.argv[3]));
  console.log(p.start.toFixed(2)+" "+p.end.toFixed(2));' "$HERE/check.js" "$W/sd.log" "$DUR")
TLEN="$(awk -v a="$TS" -v b="$TE" 'BEGIN{printf "%.2f", b-a}')"

# 2. Captions from the transcript (times shifted by the trim start)
SRT="$OUT/captions_${LANG_CODE}.srt"; HAVE_SRT=0
if [ -n "$TR" ] && [ -f "$TR" ]; then
  node "$HERE/captions.js" "$TR" "$SRT" --offset "$TS" --max-end "$TLEN" && HAVE_SRT=1 || true
fi
if [ "$AUDIO_ONLY" = 0 ] && [ "$HAVE_SRT" = 0 ] && [ "${ALLOW_NO_CAPTIONS:-0}" != 1 ]; then
  echo "No transcript, so no captions. Lead-facing video must have captions (most people watch muted)." >&2; exit 3
fi

# 3. Voice note: OGG/Opus mono 48 kHz, loudness-normalised (WhatsApp voice-message format)
ffmpeg -hide_banner -loglevel error -y -ss "$TS" -t "$TLEN" -i "$IN" -vn -ac 1 -ar 48000 \
  -af "loudnorm=I=-18:TP=-2:LRA=11" -c:a libopus -b:a 32k -application voip "$OUT/intro_${LANG_CODE}.ogg"

RESULT_VIDEO=""; THUMB=""
if [ "$AUDIO_ONLY" = 0 ]; then
  # 4. Lower-third text via files (no shell/filter escaping surprises with names like O'Brien)
  printf '%s' "$NAME" > "$W/n.txt"; printf '%s' "$PRACTICE  |  FSP $FSP" > "$W/p.txt"
  printf 'SortMyCover' > "$W/e1.txt"; printf 'a service of Lead Velocity' > "$W/e2.txt"
  ESC_SRT="$(printf '%s' "$SRT" | sed "s/\\\\/\\\\\\\\/g; s/:/\\\\:/g; s/'/\\\\'/g")"
  # libass scales SRT styles to a 288-line canvas: FontSize 10 ~ 67 px and MarginV 85 ~ 570 px on 1920 (above the lower-third, inside the Reels safe zone)
  SUBS=""
  [ "$HAVE_SRT" = 1 ] && SUBS=",subtitles='${ESC_SRT}':force_style='FontName=${FONT},FontSize=10,Bold=1,Outline=1.5,Shadow=0,MarginV=85,Alignment=2,PrimaryColour=&H00FFFFFF,OutlineColour=&H99000000,BorderStyle=1'"
  LT=",drawbox=x=0:y=ih-250:w=iw:h=130:color=0xF5A623@0.95:t=fill:enable='between(t,0.3,6)'"
  LT="$LT,drawtext=font='${FONT}':textfile=$W/n.txt:fontcolor=0x2A1B02:fontsize=44:x=40:y=h-236:enable='between(t,0.3,6)'"
  LT="$LT,drawtext=font='${FONT}':textfile=$W/p.txt:fontcolor=0x2A1B02:fontsize=28:x=40:y=h-176:enable='between(t,0.3,6)'"
  BASE="scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x1F2933,setsar=1,fps=30"

  encode() { # $1 = video kbps
    ffmpeg -hide_banner -loglevel error -y -ss "$TS" -t "$TLEN" -i "$IN" \
      -f lavfi -t 1.5 -i "color=c=0x1F2933:s=1080x1920:r=30" -f lavfi -t 1.5 -i "anullsrc=r=48000:cl=mono" \
      -filter_complex "[0:v]${BASE}${SUBS}${LT}[main];[0:a]aresample=48000,aformat=channel_layouts=mono,loudnorm=I=-16:TP=-1.5:LRA=11[a0];
        [1:v]drawbox=x=440:y=840:w=200:h=8:color=0xF5A623:t=fill,drawtext=font='${FONT}':textfile=$W/e1.txt:fontcolor=0xFBF8F2:fontsize=84:x=(w-text_w)/2:y=900,drawtext=font='${FONT}':textfile=$W/e2.txt:fontcolor=0xDCD6CB:fontsize=34:x=(w-text_w)/2:y=1010,format=yuv420p[end];
        [2:a]aformat=sample_rates=48000:channel_layouts=mono[a1];
        [main][a0][end][a1]concat=n=2:v=1:a=1[v][a]" \
      -map "[v]" -map "[a]" -c:v libx264 -preset medium -profile:v high -pix_fmt yuv420p -b:v "${1}k" -maxrate "$(( $1 * 3 / 2 ))k" -bufsize "$(( $1 * 2 ))k" \
      -c:a aac -b:a 96k -movflags +faststart "$OUT/intro_${LANG_CODE}.mp4"
  }
  # 5. Size budget: bitrate from duration, then auto-compress until <= MAX_MB (3 tries)
  TOTAL="$(awk -v d="$TLEN" 'BEGIN{printf "%.2f", d+1.5}')"
  KBPS="$(awk -v t="$TOTAL" -v mb="$TARGET_MB" 'BEGIN{k=int((mb*8192/t)-110); if(k>3500)k=3500; if(k<400)k=400; print k}')"
  for try in 1 2 3; do
    encode "$KBPS"
    SZ="$(stat -c %s "$OUT/intro_${LANG_CODE}.mp4")"
    [ "$SZ" -le $(( MAX_MB * 1024 * 1024 )) ] && break
    KBPS=$(( KBPS * 7 / 10 )); echo "oversize ($SZ bytes), recompressing at ${KBPS}k" >&2
  done
  # 6. Thumbnail: a frame ~1.2 s in (face settled, caption/lower-third visible) from the finished video
  ffmpeg -hide_banner -loglevel error -y -ss 1.2 -i "$OUT/intro_${LANG_CODE}.mp4" -frames:v 1 -vf "scale=540:-2" -q:v 3 "$OUT/thumb_${LANG_CODE}.jpg"
  RESULT_VIDEO="intro_${LANG_CODE}.mp4"; THUMB="thumb_${LANG_CODE}.jpg"
fi

# 7. Check the finished file (video carries a 1.5 s end-frame, so allow 1.5 s more)
STATUS=0; MSG=""
if [ "$AUDIO_ONLY" = 0 ]; then
  node "$HERE/check.js" "$OUT/$RESULT_VIDEO" --max 41.5 --json > "$W/check.json" 2> "$W/check.err" || STATUS=$?
else
  node "$HERE/check.js" "$OUT/intro_${LANG_CODE}.ogg" --json > "$W/check.json" 2> "$W/check.err" || STATUS=$?
fi
MSG="$(cat "$W/check.err" 2>/dev/null || true)"
node -e '
  const fs=require("fs"); const [out,lang,video,thumb,status,msg,chk,srt]=process.argv.slice(1);
  let check={}; try{check=JSON.parse(fs.readFileSync(chk,"utf8"));}catch{}
  fs.writeFileSync(out+"/result.json",JSON.stringify({ok:status==="0",language:lang,video:video||null,voice:"intro_"+lang+".ogg",thumbnail:thumb||null,captions:srt==="1"?"captions_"+lang+".srt":null,reason:msg||null,check},null,2));
' "$OUT" "$LANG_CODE" "$RESULT_VIDEO" "$THUMB" "$STATUS" "$MSG" "$W/check.json" "$HAVE_SRT"
[ "$STATUS" = 0 ] || { echo "$MSG" >&2; exit 1; }
echo "done: $OUT/result.json"
