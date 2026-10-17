const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const dir=__dirname;
const source='C:/Users/Jono/.codex/generated_images/01a1180c-bbe3-7471-9004-d6634e0983dc/exec-aa6c703d-4e3a-4999-8f74-494000ef87a8.png';
fs.copyFileSync(source,path.join(dir,'Einstein-realistic-welcome-sprite-sheet.png'));
for(let i=0;i<4;i++)execFileSync('ffmpeg',['-y','-i',source,'-vf',`crop=626:626:${i%2*627}:${Math.floor(i/2)*627},scale=600:600`,'-frames:v','1',path.join(dir,`realistic-pose-${i}.png`)],{stdio:'ignore'});
const order=[0,1,2,3,2,1];
fs.writeFileSync(path.join(dir,'realistic-frames.ffconcat'),'ffconcat version 1.0\n'+order.map(i=>`file 'realistic-pose-${i}.png'\nduration 0.25`).join('\n')+"\nfile 'realistic-pose-0.png'\n");
execFileSync('ffmpeg',['-y','-f','concat','-safe','0','-i',path.join(dir,'realistic-frames.ffconcat'),'-vf','fps=12,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle','-loop','0',path.join(dir,'Einstein-Realistic-Welcome-Aboard.gif')],{stdio:'ignore'});
execFileSync('ffmpeg',['-y','-stream_loop','3','-i',path.join(dir,'Einstein-Realistic-Welcome-Aboard.gif'),'-t','6','-vf','fps=24,format=yuv420p','-c:v','libx264','-crf','20','-movflags','+faststart',path.join(dir,'Einstein-Realistic-Welcome-Aboard-WhatsApp.mp4')],{stdio:'ignore'});
for(const file of ['Einstein-Realistic-Welcome-Aboard.gif','Einstein-Realistic-Welcome-Aboard-WhatsApp.mp4'])fs.copyFileSync(path.join(dir,file),path.join('C:/Users/Jono/Desktop',file));
console.log('Created GIF and WhatsApp MP4 on Desktop.');

