/* Cálculos puros de frequência. Nunca conta ausência quando não existe marcação. */
(function(root){
  'use strict';
  function calcular(raw, pessoaId=''){
    const chamadas=[...(raw.chamadas||[])].sort((a,b)=>a.data_celula.localeCompare(b.data_celula));
    const membros=(raw.membros||[]).filter(m=>m.ativo!==false && (!pessoaId||m.id===pessoaId));
    const status=new Map((raw.presencas||[]).map(p=>[p.chamada_id+'|'+p.user_id,p.status]));
    const eligible=(m,data)=>(m.data_ingresso_celula||String(m.created_at||'0000-01-01').slice(0,10))<=data;
    let totalPresente=0,totalAusente=0;
    const linhas=membros.map(m=>{
      let presente=0,ausente=0;
      const datas=chamadas.map(c=>{
        if(!eligible(m,c.data_celula))return null;
        const st=status.get(c.id+'|'+m.id)||null;
        if(st==='presente'){presente++;totalPresente++;}
        if(st==='ausente'){ausente++;totalAusente++;}
        return st;
      });
      const realizado=presente+ausente;
      let seguidas=0,maxConsecutivas=0;
      for(let i=datas.length-1;i>=0;i--){
        if(datas[i]==='ausente'){seguidas++;maxConsecutivas=Math.max(maxConsecutivas,seguidas);}
        else break;
      }
      return {id:m.id,nome:m.name,presente,ausente,realizado,
        percentual:realizado?Math.round(presente/realizado*100):null,
        datas,consecutivas:seguidas,maxConsecutivas};
    });
    const semanas=chamadas.map((c,i)=>{
      const vals=linhas.map(l=>l.datas[i]).filter(Boolean);
      const presentes=vals.filter(x=>x==='presente').length;
      const ausentes=vals.filter(x=>x==='ausente').length;
      return {id:c.id,data:c.data_celula,tipo:c.tipo||'celula',presentes,ausentes,total:presentes+ausentes,
        percentual:presentes+ausentes?Math.round(presentes/(presentes+ausentes)*100):null};
    });
    const semanasValidas=semanas.filter(s=>s.total>0);
    const ordenadas=[...semanasValidas].sort((a,b)=>a.percentual-b.percentual);
    const marcacoes=totalPresente+totalAusente;
    return {
      chamadas,linhas:linhas.sort((a,b)=>(b.percentual??-1)-(a.percentual??-1)||a.nome.localeCompare(b.nome,'pt-BR')),
      semanas,proporcao:{presentes:totalPresente,ausentes:totalAusente},
      indicadores:{
        taxa:marcacoes?Math.round(100*totalPresente/marcacoes):null,
        realizadas:chamadas.length,
        media:chamadas.length?Math.round(10*totalPresente/chamadas.length)/10:0,
        melhor:ordenadas.at(-1)||null,pior:ordenadas[0]||null
      },
      pastoral:linhas.filter(l=>l.consecutivas>=2).sort((a,b)=>b.consecutivas-a.consecutivas),
    };
  }
  root.agapeCalcularFrequencia=calcular;
})(typeof window!=='undefined'?window:globalThis);