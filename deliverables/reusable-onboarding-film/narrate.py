import asyncio, json, pathlib, subprocess
import edge_tts
root=pathlib.Path(__file__).parent
scenes=json.loads((root/'script.json').read_text(encoding='utf-8'))
(root/'audio').mkdir(exist_ok=True)
async def main():
    sem=asyncio.Semaphore(3)
    async def one(i,s):
        async with sem:
            p=root/'audio'/f'{i:02}.mp3'
            if not p.exists():
                for attempt in range(3):
                    try:
                        await edge_tts.Communicate(s['say'],'en-US-AndrewNeural',rate='-5%').save(str(p)); break
                    except Exception:
                        if attempt==2: raise
            s['duration']=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(p)],text=True))
            if s['duration']<len(s['say'].split())*.22: raise RuntimeError('Narration truncated')
            print(f"Narration {i+1}/{len(scenes)}: {s['duration']:.1f}s",flush=True)
    await asyncio.gather(*(one(i,s) for i,s in enumerate(scenes)))
    (root/'timings.json').write_text(json.dumps(scenes,indent=2),encoding='utf-8')
asyncio.run(main())
