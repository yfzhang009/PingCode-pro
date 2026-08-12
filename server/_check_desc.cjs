const h=require('http'),f=require('fs'),t=JSON.parse(f.readFileSync('d:/pingcode/server/session.json','utf8')).accessToken;
const body=JSON.stringify({pageNo:1,pageSize:3});
const o={hostname:'39.100.83.141',port:81,path:'/admin-api/project/work-item/page?projectId=8&pageNo=1&pageSize=3&addon=',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'tenant-id':'1','Authorization':'Bearer '+t,'principalId':'8'}};
const r=h.request(o,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if(j.data&&j.data.list){
      const it=j.data.list[0];
      console.log('description:',it.description);
      console.log('Keys:',Object.keys(it).join(','));
    }else{
      console.log('Resp:',d.substring(0,300));
    }
  }catch(e){console.log('ERROR:',e.message,'Resp:',d.substring(0,300))}
})});
r.write(body);r.end();
