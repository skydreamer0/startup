import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFontSourceReader, parseFontRecords, assertCharsetCoverage, assertPlatformFonts, assertFontSources, readInstalledFontSources, verifyInstalledFontSources } from './font-sources.mjs';
const title='登記批次進貨', file='/usr/share/fonts/truetype/synthetic/owned.ttc', charset='6279 6b21 767b 8a18 8ca8 9032';
const font=()=>({familyName:'WenQuanYi Zen Hei',postScriptName:'WenQuanYiZenHei',isCustomFont:false,glyphCount:6});
function adapter(){return{list:()=>`${file}\t0\tWenQuanYi Zen Hei,文泉驛正黑\tWenQuanYiZenHei\n`,query:()=>`${file}\t0\tWenQuanYi Zen Hei,文泉驛正黑\tWenQuanYiZenHei\t${charset}\n`,realpath:v=>v,stat:()=>({isFile:()=>true}),read:()=>Buffer.from('synthetic font bytes; metadata adapter only')};}
const proof=()=>createFontSourceReader(adapter())([font()],title);
test('observed WenQuanYi identity is accepted only with exact installed metadata/coverage/hash proof',()=>{const sources=proof();assertFontSources([font()],title,sources);assert.equal(sources[0].sha256,createHash('sha256').update(adapter().read()).digest('hex'));assert.deepEqual(sources[0].requiredCodepoints,[25209,27425,30331,35352,36008,36914]);});
test('name is not an allowlist: another exact installed CJK face is accepted with the same complete proof',()=>{const io=adapter();for(const name of ['list','query']){const fn=io[name];io[name]=()=>fn().replaceAll('WenQuanYi Zen Hei','Different CJK Face').replaceAll('WenQuanYiZenHei','DifferentCJKFace');}assert.equal(createFontSourceReader(io)([{...font(),familyName:'Different CJK Face',postScriptName:'DifferentCJKFace'}],title)[0].familyName,'Different CJK Face');});
for(const[name,mutate]of Object.entries({
'missing font':p=>p.length=0,'custom font':p=>p[0].isCustomFont=true,'zero glyph':p=>p[0].glyphCount=0,'fractional count':p=>p[0].glyphCount=5.5,'missing glyph':p=>p[0].glyphCount=5,'extra glyph':p=>p[0].glyphCount=7,'missing PostScript':p=>delete p[0].postScriptName,'unknown family':p=>p[0].familyName='Unknown','unknown PostScript':p=>p[0].postScriptName='Unknown','duplicate face':p=>{p[0].glyphCount=3;p.push({...p[0]});}
}))test('source resolution rejects '+name,()=>{const fonts=[font()];mutate(fonts);assert.throws(()=>createFontSourceReader(adapter())(fonts,title));});
for(const[name,mutate]of Object.entries({
'unknown installed face':io=>io.list=()=>'',
'ambiguous file':io=>{const prior=io.list;io.list=()=>prior()+prior().replace('owned.ttc','other.ttc');},
'missing file':io=>io.read=()=>{throw Object.assign(new Error('missing font'),{code:'ENOENT'});},
'nonregular file':io=>io.stat=()=>({isFile:()=>false}),
'outside system path':io=>io.realpath=()=>'/tmp/font.ttc',
'path traversal':io=>io.realpath=()=>'/usr/share/fonts/../../private/font.ttc',
'changed file during scan':io=>{let n=0;io.read=()=>Buffer.from(String(n++));},
'scanned family mismatch':io=>{const prior=io.query;io.query=()=>prior().replace('WenQuanYi Zen Hei','Unknown');},
'scanned PostScript mismatch':io=>{const prior=io.query;io.query=()=>prior().replace('WenQuanYiZenHei','Unknown');},
'scanned index mismatch':io=>{const prior=io.query;io.query=()=>prior().replace('\t0\t','\t1\t');},
'scanned file mismatch':io=>{const prior=io.query;io.query=()=>prior().replace('owned.ttc','other.ttc');},
'Latin only charset':io=>{const prior=io.query;io.query=()=>prior().replace(charset,'20-7e');},
'one missing Chinese character':io=>{const prior=io.query;io.query=()=>prior().replace(' 9032','');},
'empty charset':io=>{const prior=io.query;io.query=()=>prior().replace(charset,'');},
'malformed charset':io=>{const prior=io.query;io.query=()=>prior().replace(charset,'4e00-xyz');},
'reversed charset range':io=>{const prior=io.query;io.query=()=>prior().replace(charset,'9fff-4e00');},
'query failure':io=>io.query=()=>{throw new Error('fc-query failed');}
}))test('installed source boundary rejects '+name,()=>{const io=adapter();mutate(io);assert.throws(()=>createFontSourceReader(io)([font()],title));});
test('range parser covers exact endpoints and rejects missing/invalid ranges',()=>{assertCharsetCoverage('4e00-9fff',title);for(const v of ['4e00-9031','110000','-1','xyz','9fff-4e00'])assert.throws(()=>assertCharsetCoverage(v,title));assert.throws(()=>assertCharsetCoverage('0-10ffff','Latin'));});
test('fontconfig output must have exact fields and valid index',()=>{assert.throws(()=>parseFontRecords('x\t0\tx'));assert.throws(()=>parseFontRecords('x\t-1\tx\tx'));assert.throws(()=>parseFontRecords('x\t0.5\tx\tx'));assert.throws(()=>parseFontRecords('x\t0\tx\t'));});
for(const[name,mutate]of Object.entries({
'missing source':p=>p.pop(),'family identity':p=>p[0].familyName='Other','PostScript identity':p=>p[0].postScriptName='Other','file outside':p=>p[0].file='/tmp/font','file size':p=>p[0].bytes=0,'bad hash':p=>p[0].sha256='not-a-hash','missing charset':p=>p[0].charset='20-7e','charset hash':p=>p[0].charsetSha256='f'.repeat(64),'wrong text coverage':p=>p[0].requiredCodepoints.pop()
}))test('saved source proof rejects '+name,()=>{const sources=proof();mutate(sources);assert.throws(()=>assertFontSources([font()],title,sources));});
test('real installed file/query/hash is independently rechecked; forged digest cannot pass',()=>{const fonts=[{familyName:'Noto Sans CJK TC',postScriptName:'NotoSansCJKtc-Regular',glyphCount:6,isCustomFont:false}],sources=readInstalledFontSources(fonts,title);verifyInstalledFontSources(fonts,title,sources);assert.ok(sources[0].bytes>1000);sources[0].sha256='f'.repeat(64);assert.throws(()=>verifyInstalledFontSources(fonts,title,sources));});
test('real installed Latin face cannot prove Chinese coverage',()=>{assert.throws(()=>readInstalledFontSources([{familyName:'Liberation Sans',postScriptName:'LiberationSans',glyphCount:6,isCustomFont:false}],title));});
