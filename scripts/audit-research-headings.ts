import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

type Entry = { file: string; outcome: string; text?: string; sourceHash: string };
type Category = 'research' | 'mixed' | 'excluded';
type Hit = { alias: string; category: Category; files: Record<string, string> };
const audit = process.argv[2] ?? 'outputs/resume-standardization-audit';
// Supply a new output directory to rerun. Never replace an earlier audit.
const output = process.argv[3] ?? 'outputs/research-heading-audit';
if (existsSync(join(output, 'report.json'))) throw new Error('Audit output already exists; choose a new output directory.');
const englishWords = /^(?:(?:research|scientific|science|academic|industrial|professional|project|working|work|engineering|development|relevant|graduate|postdoctoral|undergraduate|selected|key|experience|experiences|projects|background|activities|history|laboratory|internship|skills|publications|publication|interests|teaching|and|education|clinical|r\s*&\s*d|&|\/|\s|-)+)$/i;
const chineseWords = /^(?:(?:主要|其他|其它|相关|个人|科研|科学研究|研究|学术|课题|项目|实习|实践|工作|教育|研发|在研|科技|实验|本科|硕士|博士|社会|经历|经验|背景|成果|情况|历程|活动|项目|奖项|发表|论文|与|和|及|、|成果|介绍|研究生|参与|主持|\/|＆|&|\s|-)+)$/;
const pattern = /研究|科研|课题|research|r\s*&\s*d/i;
const experience = /经历|经验|项目|背景|实践|工作|课题|历程|活动|experience|experiences|projects|background|work|activities|history|research$/i;
// Research work / 科研工作 can describe research alone, not a combined
// employment section. Combined outcomes/skills need per-entry classification.
const mixed = /(?:工作|教育|实习|实践).*(?:与|和|及|\/|&|＆).*(?:研究|科研|课题)|(?:研究|科研|课题).*(?:与|和|及|\/|&|＆).*(?:工作|教育|实习|实践|成果|奖项|论文)|(?:research|r\s*&\s*d).*(?:and|&|\/).*(?:work|professional|education|internship|publications|publication|teaching|skills)|(?:work|professional|education|internship|teaching).*(?:and|&|\/).*(?:research|r\s*&\s*d)/i;
const excluded = /技能|兴趣|成果|论文|奖项|skills|interests|publications/i;
const hits = new Map<string, Hit>();
const idsMention = new Set<string>();
const bodyMentions = new Set<string>();
const headings = new Set<string>();
const formats = new Map<string, string>();
const empty: Array<{recordId:string; format:string; outcome:string}> = [];
let hashMatch = 0; let hashMismatch = 0; let readable = 0;
const filenames = readdirSync(audit).filter(f => /^[a-f0-9]{16}\.json$/.test(f));
for (const filename of filenames) {
  const id = filename.slice(0, 16);
  const d = JSON.parse(readFileSync(join(audit,filename),'utf8')) as Entry;
  const format = extname(d.file).toLowerCase();
  formats.set(id, format);
  const actual = createHash('sha256').update(readFileSync(d.file)).digest('hex');
  if (actual === d.sourceHash) hashMatch++; else hashMismatch++;
  const text = d.text ?? '';
  if (!text.trim()) { empty.push({recordId:id,format,outcome:d.outcome}); continue; }
  readable++;
  if (pattern.test(text)) idsMention.add(id);
  for (const raw of text.split(/\r?\n/)) {
    // Never store paragraph contents: only strict allowlisted heading tokens qualify.
    const first = raw.trim().replace(/^(?:[\d一二三四五六七八九]+[.、)）]\s*|[•●◆▪■★☆◦\-–—]+\s*)/, '');
    const candidate = first.split(/[:：]/, 1)[0].trim().replace(/[\s:：|·•●▪■◆★☆\-_=]+$/g,'').trim();
    const isHeading = candidate && candidate.length <= 85 && pattern.test(candidate)
      && (englishWords.test(candidate) || chineseWords.test(candidate))
      && (experience.test(candidate) || excluded.test(candidate));
    if (!isHeading) {
      if (pattern.test(raw)) bodyMentions.add(id);
      continue;
    }
    const afterColon = first.match(/[:：](.*)$/)?.[1] ?? '';
    if (pattern.test(afterColon)) bodyMentions.add(id);
    const isExcludedOnly = excluded.test(candidate) && !/经历|经验|项目|实践|工作|课题|experience|projects|\bwork\b|history/i.test(candidate);
    const isOutcomesOnly = /^课题成果$/i.test(candidate);
    const clearlyResearchAndOutcomes = /(?:research|科研|研究)\s*(?:and|与|及|&|＆|\/)\s*(?:publications?|成果)/i.test(candidate);
    const category: Category = isOutcomesOnly || (isExcludedOnly && !clearlyResearchAndOutcomes) ? 'excluded' : mixed.test(candidate) ? 'mixed' : 'research';
    const key = category+'\0'+candidate;
    let hit = hits.get(key);
    if (!hit) { hit = { alias:candidate, category, files:{} }; hits.set(key,hit); }
    hit.files[id] = format; headings.add(id);
  }
}
const aliases = [...hits.values()].map(hit => ({alias:hit.alias, category:hit.category, count:Object.keys(hit.files).length, files:Object.entries(hit.files).map(([recordId,format])=>({recordId,format})).sort((a,b)=>a.recordId.localeCompare(b.recordId))})).sort((a,b)=>b.count-a.count || a.alias.localeCompare(b.alias));
const counts = Object.fromEntries((['research','mixed','excluded'] as const).map(c=>[c,{aliases:aliases.filter(x=>x.category===c).length, files:new Set(aliases.filter(x=>x.category===c).flatMap(x=>x.files.map(y=>y.recordId))).size}]));
const bodyOnlyKeywordMentions = [...bodyMentions].filter(id => !headings.has(id)).sort().map(recordId => ({recordId, format:formats.get(recordId)}));
mkdirSync(output,{recursive:true,mode:0o700});
writeFileSync(join(output,'report.json'),JSON.stringify({total:filenames.length,readable,emptyCount:empty.length,empty,sourceHashVerified:hashMatch,sourceHashMismatch:hashMismatch,anyKeywordMentionFiles:idsMention.size,bodyKeywordMentionFiles:bodyMentions.size,bodyOnlyKeywordMentionFiles:bodyOnlyKeywordMentions.length,bodyOnlyKeywordMentions,anyStrictHeadingCandidateFiles:headings.size,counts,aliases,limitations:['Recognized exact allowlisted section-heading candidates only, including colon-prefixed inline content; not every match is a true top-level heading, and aliases outside this finite vocabulary and damaged or multi-column text are not exhausted.','Body mentions include lines not recognized by the strict heading rule and may include unrecognized headings; they do not identify individual research experiences.','Mixed headings require per-entry classification; research output must not presume employment.','Documents with no cached text, and image content in otherwise readable files, cannot be scanned without OCR.']},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({total:filenames.length,readable,emptyCount:empty.length,sourceHashVerified:hashMatch,sourceHashMismatch:hashMismatch,anyKeywordMentionFiles:idsMention.size,bodyOnlyKeywordMentionFiles:bodyOnlyKeywordMentions.length,anyStrictHeadingCandidateFiles:headings.size,counts},null,2));
