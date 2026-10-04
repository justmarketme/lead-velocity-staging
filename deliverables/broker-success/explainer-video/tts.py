# Voice-over: one wav per line with Kokoro (local, no network), then timings.json for the renderer.
import json, sys, os, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
here = os.path.dirname(os.path.abspath(__file__)); tts = sys.argv[1]; out = sys.argv[2]
S = json.load(open(os.path.join(here, 'script.json')))
k = Kokoro(os.path.join(tts, 'model_q8.onnx'), os.path.join(tts, 'voices.npz'))
os.makedirs(out, exist_ok=True); SR = 24000; timing = []
for sc in S['scenes']:
    t = 0.6; chunks = [np.zeros(int(0.6 * SR), np.float32)]; lines = []
    for ln in sc['lines']:
        a, sr = k.create(ln['say'], voice=S['voice'], speed=S['speed'], lang='en-gb')
        lines.append({'start': round(t, 3), 'end': round(t + len(a) / SR, 3), 'show': ln['show']})
        chunks += [a.astype(np.float32), np.zeros(int(S['gap'] * SR), np.float32)]; t += len(a) / SR + S['gap']
    tail = 0.9; chunks.append(np.zeros(int(tail * SR), np.float32)); t += tail
    sf.write(os.path.join(out, sc['id'] + '.wav'), np.concatenate(chunks), SR)
    timing.append({'id': sc['id'], 'dur': round(t, 3), 'lines': lines}); print(sc['id'], round(t, 1))
json.dump(timing, open(os.path.join(out, 'timings.json'), 'w'), indent=1)
print('total', round(sum(x['dur'] for x in timing), 1))
