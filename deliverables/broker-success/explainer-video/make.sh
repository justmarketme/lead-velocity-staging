#!/usr/bin/env bash
# Rebuilds the broker explainer video (16:9, 1080p, voice-over + burned-in captions).
# 1) voice-over:  python tts.py <kokoro_dir> <vo_dir>   (Kokoro-82M, local; kokoro_dir holds model_q8.onnx + voices.npz)
#                 To swap in an ElevenLabs or recorded voice: drop s1.wav..s10.wav into <vo_dir> and fix the
#                 start/end of each line in <vo_dir>/timings.json. Nothing else changes.
# 2) ad frames:   ffmpeg -i <C01 4x5 mp4> -vf fps=25,scale=540:-2 media/c01/%04d.jpg
# 3) scenes:      node render.cjs <vo_dir> <out_dir>      (headless Chromium, 25 fps, one mp4 per scene)
# 4) join:        ./make.sh join <out_dir> <final.mp4>
set -euo pipefail
if [ "${1:-}" = join ]; then
  out=$2; final=$3; list=$(mktemp)
  for i in $(seq 1 10); do echo "file '$out/s$i.mp4'" >> "$list"; done
  ffmpeg -loglevel error -y -f concat -safe 0 -i "$list" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -af "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000" -ac 2 -c:a aac -b:a 192k -movflags +faststart "$final"
  rm "$list"; echo "wrote $final"
fi
