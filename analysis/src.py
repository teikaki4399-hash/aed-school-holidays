import re, unicodedata, collections
from ambdef import amb
rows=[]
for l in open('aed_times_all.tsv',encoding='utf-8'):
    if not l.strip(): continue
    f=l.rstrip('\n').split('\t'); f+=['']*(8-len(f)); rows.append((int(f[0]),f[1:8]))
order=[
 ('移動交番車・警備艇の運用予定',re.compile('移動交番|警備艇')),
 ('医療機関の診療時間',re.compile('診療|診察|クリニック')),
 ('学校・園の年間予定',re.compile('開校|学校|課業|長期休|放課後|部活|閉庁日|園児|園の行事|休園|学期')),
 ('集会所などの利用・予約しだい',re.compile('使用時|利用時|利用中|利用者|予約|団体活動|開放時|開放日|宿泊者|開錠|体育館|屋内運動場')),
 ('管理人・職員がいるかしだい',re.compile('在中|在籍|在席|不在|管理人|事務所')),
 ('施設の休館日・開館時間',re.compile('休館|開館|開所|開場|開庁|開園|休所|休場|整理|定休|臨時|点検|メンテナンス|雨天|園内整備|閉場|お盆|盆休み|夏季|開業|開設|プール|キャンプ')),
]
C=collections.Counter(); EX=collections.defaultdict(list); tot=0
for n,f in rows:
    vals=[v for v in f[:6] if v.strip() and v.strip() not in '-‐']
    if not vals: continue
    t=unicodedata.normalize('NFKC',' ／ '.join(vals))
    if not amb(t): continue
    tot+=n
    for k,r in order:
        if r.search(t): C[k]+=n; EX[k].append(t[:40]) if len(EX[k])<4 else None; break
    else: C['ぼかしのみ']+=n; EX['ぼかしのみ'].append(t[:40]) if len(EX['ぼかしのみ'])<4 else None
print(tot)
for k,v in C.most_common(): print(v,k,' | '.join(EX[k]))
