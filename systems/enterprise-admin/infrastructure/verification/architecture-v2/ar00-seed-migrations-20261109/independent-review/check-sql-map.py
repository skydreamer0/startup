import pathlib,json,re,hashlib
root=pathlib.Path.cwd()
e=json.loads((root/'systems/enterprise-admin/infrastructure/plans/architecture-v2/seed-migration-effects.json').read_text())
schema=(root/'systems/enterprise-admin/backend/prisma/schema.prisma').read_text()
maps={re.search(r'@@map\("([^"]+)"\)',body)[1]:name for name,body in re.findall(r'model (\w+) \{([\s\S]*?)\n\}',schema)}
results=[]
for m in e['migrations']:
 sql=(root/m['source']['path']).read_text();targets=[];found=[];errors=[]
 for pat in [r'(?:CREATE|ALTER) TABLE "(\w+)"',r'CREATE (?:UNIQUE )?INDEX "[^"]+"\s+ON "(\w+)"',r'(?:INSERT INTO|UPDATE|DELETE FROM) (\w+)']:
  targets+=re.findall(pat,sql)
 actual={maps[t] for t in targets if t in maps}
 if actual!=set(m['targets']): errors.append('target set differs')
 for f in re.finditer(r'CONSTRAINT "([^"]+)"\s+FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES "([^"]+)"\s*\(([^)]+)\)([^;,]*)(?:[;,])',sql):
  preceding=list(re.finditer(r'(?:CREATE|ALTER) TABLE "(\w+)"',sql[:f.start()]))
  suffix=f[5]
  action=lambda name: (x[1] if (x:=re.search(r'ON '+name+r'\s+(CASCADE|RESTRICT|SET NULL|NO ACTION|SET DEFAULT)',suffix)) else 'NO ACTION (implicit)')
  parsed={'name':f[1],'line':sql[:f.start()].count('\n')+1,'table':preceding[-1][1],'columns':re.findall(r'"([^"]+)"',f[2]),'referencedTable':f[3],'referencedColumns':re.findall(r'"([^"]+)"',f[4]),'onDelete':action('DELETE'),'onUpdate':action('UPDATE'),'deferrableInitiallyDeferred':'DEFERRABLE INITIALLY DEFERRED' in suffix}
  found.append(parsed)
 if found!=m['foreignKeys']: errors.append('foreign key declaration differs')
 if len(found)!=len(re.findall(r'FOREIGN KEY',sql)):errors.append('unparsed FK')
 results.append({'migration':m['id'],'sha256':hashlib.sha256(sql.encode()).hexdigest(),'targetModels':sorted(actual),'foreignKeyDeclarations':len(found),'errors':errors})
print(json.dumps({'method':'Independent read-only pattern-assisted comparison of the 16 current literal SQL files, combined with manual reading. Not a general SQL parser or runtime proof.','result':'PASS' if not any(r['errors'] for r in results) else 'FAIL','foreignKeyDeclarations':sum(r['foreignKeyDeclarations'] for r in results),'migrations':results},indent=2))
