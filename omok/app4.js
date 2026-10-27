function aiMove(){
  if(gameOver||privateMode)return;

  const empties=[];
  for(let r=0;r<N;r++){
    for(let c=0;c<N;c++){
      if(!board[r][c])empties.push([r,c]);
    }
  }
  if(!empties.length){thinking=false;return}

  const t=tierFor(currentOpponent.rating);
  const level=Math.max(0,TIERS.findIndex(x=>x.name===t.name));

  const cfg=[
    {topK:4,noise:16,lookahead:false,combo:0.72,shape:0.72},
    {topK:4,noise:12,lookahead:false,combo:0.80,shape:0.80},
    {topK:3,noise:9, lookahead:false,combo:0.88,shape:0.88},
    {topK:3,noise:6, lookahead:true, combo:0.96,shape:0.96},
    {topK:2,noise:4, lookahead:true, combo:1.04,shape:1.04},
    {topK:2,noise:2, lookahead:true, combo:1.13,shape:1.12},
    {topK:1,noise:1, lookahead:true, combo:1.22,shape:1.20},
    {topK:1,noise:0, lookahead:true, combo:1.35,shape:1.30}
  ][level];

  function countLinePotential(r,c,p){
    let bonus=0;
    for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]){
      let count=1,open=0;
      for(const s of[-1,1]){
        let rr=r+dr*s,cc=c+dc*s;
        while(rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===p){
          count++; rr+=dr*s; cc+=dc*s;
        }
        if(rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===0)open++;
      }
      if(count===4&&open>=1) bonus+=4000;
      else if(count===3&&open===2) bonus+=900;
      else if(count===2&&open===2) bonus+=220;
    }
    return bonus;
  }

  for(const [r,c] of empties){
    board[r][c]=2;
    const win=checkWin(r,c,2);
    board[r][c]=0;
    if(win){
      thinking=false;
      stopTurnTimer();
      place(r,c,2);
      if(!gameOver){
        $('status').textContent=`${currentOpponent.name} 대국 중 · 내 차례`;
        $('turnChip').textContent='현재: 흑';startTurnTimer();
      }
      return;
    }
  }

  const mustBlocks=[];
  for(const [r,c] of empties){
    board[r][c]=1;
    const danger=checkWin(r,c,1);
    board[r][c]=0;
    if(danger)mustBlocks.push([r,c]);
  }
  if(mustBlocks.length){
    const p=mustBlocks[0];
    thinking=false;
    stopTurnTimer();
    place(p[0],p[1],2);
    if(!gameOver){
      $('status').textContent=`${currentOpponent.name} 대국 중 · 내 차례`;
      $('turnChip').textContent='현재: 흑';startTurnTimer();
    }
    return;
  }

  const ranked=[];
  for(const [r,c] of empties){
    const attack=score(r,c,2);
    const defend=score(r,c,1);

    board[r][c]=2;
    const ownPotential=countLinePotential(r,c,2);
    board[r][c]=0;

    board[r][c]=1;
    const oppPotential=countLinePotential(r,c,1);
    board[r][c]=0;

    let local=0;
    for(let rr=Math.max(0,r-2);rr<=Math.min(N-1,r+2);rr++){
      for(let cc=Math.max(0,c-2);cc<=Math.min(N-1,c+2);cc++){
        if(board[rr][cc])local++;
      }
    }

    const center=Math.max(0,10-(Math.abs(r-7)+Math.abs(c-7))*.55);
    let sc=
      attack*(1.00+level*.035)+
      defend*(0.96+level*.045)+
      ownPotential*cfg.combo+
      oppPotential*(0.86+level*.045)+
      local*(6+level*1.4)+
      center*cfg.shape*8;

    if(cfg.lookahead){
      board[r][c]=2;
      let oppBest=0;
      let checked=0;
      for(let rr=0;rr<N&&checked<55;rr++){
        for(let cc=0;cc<N&&checked<55;cc++){
          if(board[rr][cc]===0){
            const s=score(rr,cc,1);
            if(s>oppBest)oppBest=s;
            checked++;
          }
        }
      }
      board[r][c]=0;
      sc-=oppBest*(0.10+level*.015);
    }

    if(cfg.noise)sc+=Math.random()*cfg.noise;
    ranked.push({r,c,sc});
  }

  ranked.sort((a,b)=>b.sc-a.sc);

  const k=Math.min(cfg.topK,ranked.length);
  let pick;
  if(k<=1){
    pick=ranked[0];
  }else{
    const weights=k===4?[0.56,0.24,0.13,0.07]:k===3?[0.68,0.22,0.10]:[0.82,0.18];
    const x=Math.random();
    let acc=0,chosen=0;
    for(let i=0;i<weights.length;i++){
      acc+=weights[i];
      if(x<=acc){chosen=i;break}
    }
    pick=ranked[Math.min(chosen,k-1)];
  }

  thinking=false;
  stopTurnTimer();
  place(pick.r,pick.c,2);
  if(!gameOver){
    $('status').textContent=`${currentOpponent.name} 대국 중 · 내 차례`;
    $('turnChip').textContent='현재: 흑';
    startTurnTimer();
  }
}
function finish(winner){
  stopTurnTimer();gameOver=true;thinking=false;

  if(privateMode){
    const won=winner===1;
    addPrivateRecord(privateOpponentName,won);
    $('status').textContent=won?'사설방 승리!':'사설방 패배';
    $('queueChip').textContent='사설방 종료';
    $('turnChip').textContent='대국 종료';updateTimerUI();
    return;
  }

  if(winner===1){profile.wins++;profile.seasonWins=(profile.seasonWins||0)+1;profile.rating+=25;$('status').textContent='승리! +25 RP'}
  else{profile.losses++;profile.seasonLosses=(profile.seasonLosses||0)+1;profile.rating=Math.max(0,profile.rating-25);$('status').textContent='패배 · -25 RP'}
  saveProfile();renderProfile();$('queueChip').textContent='대국 종료';$('turnChip').textContent='결과 확정';updateTimerUI()
}
$('rematchBtn').addEventListener('click',()=>{
  if(!currentOpponent)return;
  resetBoard();
  if(privateMode){
    $('status').textContent=`${currentOpponent.name} 님과 사설방 재대국`;
    $('queueChip').textContent='사설방 대전';
  }else{
    $('status').textContent=`${currentOpponent.name} 님과 재대국. 흑 선공입니다.`;
  }
  $('turnChip').textContent='현재: 흑';
  startTurnTimer();
});
$('undoBtn').addEventListener('click',()=>{if(gameOver||thinking||history.length<2)return;stopTurnTimer();for(let i=0;i<2;i++){const m=history.pop();board[m.r][m.c]=0}turn=1;renderBoard();$('status').textContent='한 수 무르기를 사용했습니다.';$('turnChip').textContent='현재: 흑';startTurnTimer()});

loadFriends();setupBoard();initAccount();resetLobby();setInterval(()=>{if(profile){const s=profile.season;ensureSeasonState();if(profile.season!==s){renderProfile();buildRanking();}}},60000);
