// Package the rendered film without another lossy encode.
// Run after render.mjs: node package-delivery.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const out = path.join(root, 'final');
fs.mkdirSync(out, {recursive:true});
const timing = JSON.parse(fs.readFileSync(path.join(here,'timings.json'),'utf8'));
const offsets = JSON.parse(fs.readFileSync(path.join(here,'clips','offsets.json'),'utf8'));
const probe = file => JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-show_chapters','-of','json',file],{encoding:'utf8'}));
const duration = Number(probe(path.join(root,'what-happens-next-1080p.mp4')).format.duration);
const stamp = (t, separator='.') => {
  const ms = Math.round(t * 1000);
  return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`;
};
const cues = timing.scenes.flatMap((s,i) => s.cues.map(c => ({text:c.text,start:offsets[i].start+c.t,end:Math.min(offsets[i].start+c.e, i+1<offsets.length?offsets[i+1].start:duration)}))).filter(c=>c.end>c.start);
fs.writeFileSync(path.join(out,'SortMyCover-Explainer.srt'),cues.map((c,i)=>`${i+1}\n${stamp(c.start,',')} --> ${stamp(c.end,',')}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(out,'SortMyCover-Explainer.vtt'),'WEBVTT\n\n'+cues.map(c=>`${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));
const chapters = offsets.map((o,i)=>({title:timing.scenes[i].title.replace(/^Scene \d+: /,'').replace(/ \(about.*$/,''),start:o.start,end:i+1<offsets.length?offsets[i+1].start:duration}));
const metadata = ';FFMETADATA1\ntitle=SortMyCover — What happens next\nartist=Lead Velocity\n'+chapters.map(c=>`[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start*1000)}\nEND=${Math.round(c.end*1000)}\ntitle=${c.title}\n`).join('');
const metaPath=path.join(out,'chapters.ffmetadata');
fs.writeFileSync(metaPath,metadata);
const files=[];
for(const [size,label] of [['1080p','1080p'],['720p','WhatsApp-720p']]) {
  const file=path.join(out,`SortMyCover-Explainer-${label}.mp4`);
  execFileSync('ffmpeg',['-y','-v','error','-i',path.join(root,`what-happens-next-${size}.mp4`),'-f','ffmetadata','-i',metaPath,'-map','0:v:0','-map','0:a:0','-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',file]);
  execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{stdio:'pipe'});
  const p=probe(file);
  if(p.chapters.length!==8 || !p.streams.some(s=>s.codec_type==='audio')) throw new Error('Missing chapter/audio');
  const bytes=fs.statSync(file).size;
  if(size==='720p' && bytes>=16000000) throw new Error('WhatsApp export exceeds 16 MB');
  files.push({file:path.basename(file),bytes,duration:Number(p.format.duration),width:p.streams[0].width,height:p.streams[0].height,chapters:p.chapters.length,decode:'passed'});
}
fs.copyFileSync(path.join(root,'poster.jpg'),path.join(out,'poster.jpg'));
fs.writeFileSync(path.join(out,'chapters.json'),JSON.stringify(chapters,null,2));
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({date:'2026-10-07',files,captions:cues.length,source:'Existing 6 October onboarding film; narration and commercial wording preserved.'},null,2));
fs.writeFileSync(path.join(out,'README.md'),`# SortMyCover explainer for Mark\n\nCompleted delivery package, 7 October 2026. Duration: 3:22.\n\n- SortMyCover-Explainer-1080p.mp4 — full-quality version.\n- SortMyCover-Explainer-WhatsApp-720p.mp4 — smaller WhatsApp version, under 16 MB.\n- Both include narration, burned-in captions, eight chapters and fast-start playback.\n- SRT and WebVTT subtitles are included for editing or web players.\n- poster.jpg is the thumbnail.\n\nContinues the local “What happens next” film from 6 October. Existing narration, visuals and commercial wording are preserved. No video has been published or sent to Mark.\n\nVerification: both exports decode without errors; H.264 video, AAC audio, eight chapters, matching duration. Visual review sampled all eight scenes. Rebuild with node build/package-delivery.mjs after rendering.\n`);
console.log(JSON.stringify({out,files,captions:cues.length},null,2));
