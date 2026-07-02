#!/usr/bin/env python3
"""Monta a entrada de um set legado e faz append no legacy_<era>.js.
Uso: python3 build_legacy_set.py <setId> <arquivo_dados> <usd_brl>
arquivo_dados: linhas 'number;name;RAR;usd' separadas por '|' (saída do Chrome)."""
import json,os,re,sys

RAR_PT={'C':'Comum','U':'Incomum','R':'Rara','RH':'Rara Holo','UR':'Rara Ultra',
 'SEC':'Rara Secreta','RB':'Rara Rainbow','SH':'Rara Shiny','SHG':'Rara Shiny GX',
 'AZ':'Rara Incrível','RAD':'Rara Radiante','TG':'Galeria de Treinador','IR':'Ilustr. Rara',
 'SIR':'Ilustr. Esp. Rara','REX':'Rara Holo EX','RGX':'Rara Holo GX','RV':'Rara Holo V',
 'RVM':'Rara Holo VMAX','RVS':'Rara Holo VSTAR','BRK':'Rara BREAK','PRS':'Prism Star',
 'STAR':'Rara Star','PRI':'Rara Prime','ACE':'ACE SPEC','LEG':'LEGEND','P':'Promo',
 'CC':'Coleção Clássica','DR':'Rara Dupla','HR':'Rara Hyper'}
ERA_COLOR={'SWSH':'#5C6BC0','SM':'#FF7043','XY':'#26A69A','BW':'#8D6E63',
 'HGSS':'#FBC02D','DP':'#7E57C2','EX':'#42A5F5','CLASSIC':'#EF5350'}
ERA_EMOJI={'SWSH':'⚔️','SM':'🌙','XY':'🧬','BW':'⚫','HGSS':'💛','DP':'💎','EX':'🔷','CLASSIC':'🕰️'}

def main():
    set_id,data_file,rate=sys.argv[1],sys.argv[2],float(sys.argv[3])
    root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    q=json.load(open(os.path.join(root,'scripts/legacy_queue.json'),encoding='utf-8'))
    meta=next(x for x in q['queue'] if x['id']==set_id)
    raw=open(data_file,encoding='utf-8').read().strip()
    cards=[]
    for item in raw.split('|'):
        p=item.split(';')
        if len(p)<4:continue
        n,name,rar,usd=p[0],';'.join(p[1:-2]),p[-2],p[-1]
        try:usd=float(usd)
        except:usd=0.0
        brl=round(usd*rate,2)
        num=re.sub(r'\D','',n)
        base=bool(num) and int(num)<=meta['printed'] and n==num
        cards.append({'n':n,'name':name,'rare':RAR_PT.get(rar,rar or '—'),'price':brl,'base':base})
    assert len(cards)>=meta['total']*0.8, f"só {len(cards)} de {meta['total']} cartas — extração incompleta"
    entry={'id':set_id,'label':f"{set_id.upper()} — {meta['name']}",'emoji':ERA_EMOJI[meta['series']],
           'cards':len(cards),'color':ERA_COLOR[meta['series']],'series':meta['series'],
           'releaseDate':meta['year'],'data':cards}
    era_file=os.path.join(root,meta['file'])
    js='\nwindow.LEGACY_SETS.push('+json.dumps(entry,ensure_ascii=False,separators=(',',':'))+');\n'
    with open(era_file,'a',encoding='utf-8') as f:f.write(js)
    # marca done
    meta['status']='done';meta['cards_importados']=len(cards)
    json.dump(q,open(os.path.join(root,'scripts/legacy_queue.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    print(f"OK {set_id}: {len(cards)} cartas → {meta['file']} (USD_BRL={rate})")

if __name__=='__main__':main()
